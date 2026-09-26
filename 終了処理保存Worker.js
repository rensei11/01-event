// Cloudflare Worker: 終了処理を GitHub の年間台帳・実地レポートへ確定保存する
// Secrets: GITHUB_TOKEN, EDIT_KEY
// Optional vars: ALLOWED_ORIGIN (default: https://rensei11.github.io)

const OWNER='rensei11';
const REPO='01-event';
const BRANCH='main';

export default {
  async fetch(request, env) {
    const origin=request.headers.get('Origin')||'';
    const allowed=env.ALLOWED_ORIGIN||'https://rensei11.github.io';
    const cors={
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers':'Content-Type,X-Edit-Key',
      'Access-Control-Allow-Methods':'POST,OPTIONS',
      'Vary':'Origin'
    };
    if(request.method==='OPTIONS'){
      if(origin&&origin!==allowed)return new Response('Forbidden',{status:403});
      return new Response(null,{status:204,headers:cors});
    }
    if(origin&&origin!==allowed)return json({ok:false,error:'許可されていない送信元です'},403,cors);
    const url=new URL(request.url);
    if(request.method!=='POST'||!['/save','/save-v2'].includes(url.pathname))return json({ok:false,error:'Not found'},404,cors);
    if(!env.GITHUB_TOKEN||!env.EDIT_KEY)return json({ok:false,error:'Workerの初期設定が未完了です'},500,cors);
    if(request.headers.get('X-Edit-Key')!==env.EDIT_KEY)return json({ok:false,error:'編集キーが違います'},401,cors);

    let body;
    try{body=await request.json()}catch{return json({ok:false,error:'送信データを読めません'},400,cors)}
    const v=validate(body);
    if(v)return json({ok:false,error:v},400,cors);

    try{
      const result=await saveToGitHub(body,env.GITHUB_TOKEN);
      return json({ok:true,...result},200,cors);
    }catch(err){
      const status=err.status||500;
      return json({ok:false,error:err.message||String(err)},status,cors);
    }
  }
};

function json(obj,status,headers){
  return new Response(JSON.stringify(obj),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
}

function validate(d){
  if(!d||typeof d!=='object')return 'データがありません';
  if(!d.eventId||!(d.eventName||d.name))return 'イベント情報がありません';
  if(!['exhibition','gathering'].includes(d.kind))return 'イベント種別が不正です';
  if(d.editOnly){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date||'')))return '開始日が不正です';
    if(d.endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(d.endDate)))return '終了日が不正です';
    if(d.endDate&&d.endDate<d.date)return '終了日は開始日以降にしてください';
    return '';
  }
  if(!['attended','not_attended'].includes(d.status))return '参加／未参加を選んでください';
  if(d.status==='attended'&&(!Array.isArray(d.visitDates)||!d.visitDates.length))return '実際に行った日を選んでください';
  if(d.status==='attended'&&!String(d.report||'').trim())return '参加したイベントは実地レポートを入力してください';
  return '';
}

async function gh(path,token,options={}){
  const r=await fetch('https://api.github.com'+path,{
    ...options,
    headers:{
      'Authorization':'Bearer '+token,
      'Accept':'application/vnd.github+json',
      'X-GitHub-Api-Version':'2022-11-28',
      'User-Agent':'01-event-end-process-worker',
      ...(options.headers||{})
    }
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok){
    const e=new Error((data&&data.message)||('GitHub API error '+r.status));
    e.status=r.status===409||r.status===422?409:500;
    throw e;
  }
  return data;
}

function decodeBase64Utf8(s){
  const bin=atob(String(s||'').replace(/\n/g,''));
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function readJson(path,token,ref=BRANCH,allowMissing=false){
  try{
    const d=await gh('/repos/'+OWNER+'/'+REPO+'/contents/'+encodePath(path)+'?ref='+encodeURIComponent(ref),token);
    return {json:JSON.parse(decodeBase64Utf8(d.content)),sha:d.sha,path};
  }catch(e){
    if(allowMissing&&/Not Found/i.test(e.message))return {json:null,sha:null,path};
    throw e;
  }
}
function encodePath(path){return path.split('/').map(encodeURIComponent).join('/')}
function reportPathFor(date){
  const y=String(date).slice(0,4),m=Number(String(date).slice(5,7));
  return m<=3?'実地レポート/'+y+'-01-03.json':'実地レポート/'+y+'-'+String(m).padStart(2,'0')+'.json';
}
function reportMonthValue(path){
  const m=path.match(/(\d{4})-(\d{2})(?:-03)?\.json$/);
  return m?Number(m[2]):0;
}
function scheduleDateText(start,end){
  const w=['日','月','火','水','木','金','土'];
  const fmt=(iso)=>{
    const d=new Date(iso+'T00:00:00Z');
    return (d.getUTCMonth()+1)+'月'+d.getUTCDate()+'日('+w[d.getUTCDay()]+')';
  };
  if(!end||end===start)return fmt(start);
  return fmt(start)+'～'+fmt(end);
}
function eventNameCodes(e){
  return (e.conditionLines||[]).filter(x=>String(x).startsWith('名前コード：')).map(x=>String(x).replace(/^名前コード：/,''));
}
function upsertUnattended(data,e,kind){
  data.events=Array.isArray(data.events)?data.events:[];
  const item={
    id:e.id,
    date:e.date,
    endDate:e.endDate||'',
    dateText:e.dateText||'',
    name:e.name,
    url:e.url||'',
    venue:e.venue||'',
    category:kind,
    attendanceStatus:'not_attended',
    visitDates:[],
    nameCodes:eventNameCodes(e)
  };
  const i=data.events.findIndex(x=>x.id===e.id|| (x.name===e.name&&x.date===e.date));
  if(i>=0)data.events[i]={...data.events[i],...item};else data.events.push(item);
  data.events.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));
}
function removeUnattended(data,e){
  data.events=Array.isArray(data.events)?data.events.filter(x=>!(x.id===e.id||(x.name===e.name&&x.date===e.date))):[];
}
function makeReport(e,d,kind,reportId){
  const visits=[...d.visitDates].sort();
  return {
    id:reportId,
    date:visits[0],
    visitDates:visits,
    dateText:visits.map(x=>x.slice(5).replace('-','/')).join('・'),
    scheduledDate:e.originalScheduledDate||e.date,
    scheduledEndDate:e.originalScheduledEndDate||e.endDate||e.date,
    scheduledDateText:e.originalScheduledDateText||e.dateText||'',
    name:e.name,
    url:e.url||'',
    venue:e.venue||'',
    rating:d.rating||'',
    category:kind,
    report:String(d.report||'').trim(),
    source:'終了処理'
  };
}

async function saveToGitHub(d,token){
  const ref=await gh('/repos/'+OWNER+'/'+REPO+'/git/ref/heads/'+BRANCH,token);
  const parentSha=ref.object.sha;
  const commit=await gh('/repos/'+OWNER+'/'+REPO+'/git/commits/'+parentSha,token);
  const baseTree=commit.tree.sha;

  const ledgerPath=d.kind==='exhibition'?'展示会一覧.json':'イベント一覧.json';
  const [ledgerRes,unattRes,manifestRes]=await Promise.all([
    readJson(ledgerPath,token,parentSha),
    readJson('未参加イベント.json',token,parentSha),
    readJson('実地レポート.json',token,parentSha)
  ]);
  const ledger=ledgerRes.json, unattended=unattRes.json, manifest=manifestRes.json;
  ledger.events=Array.isArray(ledger.events)?ledger.events:[];
  const idx=ledger.events.findIndex(e=>e.id===d.eventId);
  if(idx<0){const er=new Error('対象イベントが年間台帳に見つかりません');er.status=409;throw er}
  const e=ledger.events[idx];

  // イベント編集では開催日も年間台帳へ確定
  if(d.editOnly){
    e.date=String(d.date||e.date||'').trim();
    e.endDate=String(d.endDate||d.date||e.endDate||e.date).trim();
    e.dateText=scheduleDateText(e.date,e.endDate);
  }

  // 終了処理画面・イベント編集画面で年間台帳の基本情報を確定
  e.name=String(d.eventName||d.name||e.name).trim();
  e.venue=String(d.venue??e.venue??'').trim();
  e.url=String(d.url??e.url??'').trim();
  const conditionLines=String(d.conditionText??'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).filter(x=>!x.startsWith('名前コード：'));
  const personName=String(d.personName||'').trim();
  if(personName)conditionLines.push('名前コード：'+personName);
  e.conditionLines=conditionLines;
  e.rating=String(d.preRating??e.rating??'').trim();
  e.nightTime=String(d.nightTime??e.nightTime??'').trim();
  e.nightText=String(d.nightText??e.nightText??e.detailText??'').trim();
  if('detailText' in e)delete e.detailText;

  if(d.editOnly){
    const stamp=new Date().toISOString().slice(0,10)+'-web';
    ledger.dataVersion=stamp;
    const changed=[[ledgerPath,ledger]];
    if(e.attendanceStatus==='not_attended'){
      upsertUnattended(unattended,e,d.kind);
      unattended.dataVersion=stamp;
      changed.push(['未参加イベント.json',unattended]);
    }
    const tree=[];
    for(const [path,obj] of changed){
      const blob=await gh('/repos/'+OWNER+'/'+REPO+'/git/blobs',token,{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({content:JSON.stringify(obj,null,2)+'\n',encoding:'utf-8'})
      });
      tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
    }
    const newTree=await gh('/repos/'+OWNER+'/'+REPO+'/git/trees',token,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({base_tree:baseTree,tree})
    });
    const newCommit=await gh('/repos/'+OWNER+'/'+REPO+'/git/commits',token,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        message:'イベント編集: '+e.name,
        tree:newTree.sha,
        parents:[parentSha]
      })
    });
    await gh('/repos/'+OWNER+'/'+REPO+'/git/refs/heads/'+BRANCH,token,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sha:newCommit.sha,force:false})
    });
    return {commit:newCommit.sha,eventId:e.id,status:'edited',savedDate:e.date,savedEndDate:e.endDate};
  }

  const oldReportId=e.sourceReportId||'';
  let reportId=oldReportId||('rep-web-'+String(e.id).replace(/[^a-zA-Z0-9_-]/g,''));
  const paths=Array.isArray(manifest.reportFiles)?[...manifest.reportFiles]:[];
  const reportFiles=new Map();

  async function getReportFile(path,allowMissing=false){
    if(reportFiles.has(path))return reportFiles.get(path);
    const r=await readJson(path,token,parentSha,allowMissing);
    const obj=r.json||{year:Number(String(e.date).slice(0,4)),month:reportMonthValue(path),reports:[]};
    obj.reports=Array.isArray(obj.reports)?obj.reports:[];
    const pack={path,obj,exists:!!r.json};
    reportFiles.set(path,pack);return pack;
  }

  // 既存レポートが別月ファイルにある場合も見つけて削除・更新できるようにする
  let oldReportPath='';
  if(oldReportId){
    for(const p of paths){
      const pack=await getReportFile(p);
      if(pack.obj.reports.some(r=>r.id===oldReportId)){oldReportPath=p;break}
    }
  }

  if(d.status==='attended'){
    e.attendanceStatus='attended';
    e.visitDates=[...d.visitDates].sort();
    e.historySource='終了処理';
    e.sourceReportId=reportId;
    removeUnattended(unattended,e);

    const targetPath=reportPathFor(e.visitDates[0]);
    const target=await getReportFile(targetPath,true);
    // 月が変わった場合は旧ファイルから取り除く
    if(oldReportPath&&oldReportPath!==targetPath){
      const old=await getReportFile(oldReportPath);
      old.obj.reports=old.obj.reports.filter(r=>r.id!==oldReportId);
    }
    const rep=makeReport(e,d,d.kind,reportId);
    const ri=target.obj.reports.findIndex(r=>r.id===reportId);
    if(ri>=0)target.obj.reports[ri]={...target.obj.reports[ri],...rep};else target.obj.reports.push(rep);
    target.obj.reports.sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.name).localeCompare(String(b.name),'ja'));
    if(!paths.includes(targetPath))paths.push(targetPath);
  }else{
    e.attendanceStatus='not_attended';
    e.visitDates=[];
    e.historySource='終了処理';
    delete e.sourceReportId;
    upsertUnattended(unattended,e,d.kind);
    if(oldReportPath){
      const old=await getReportFile(oldReportPath);
      old.obj.reports=old.obj.reports.filter(r=>r.id!==oldReportId);
    }
  }

  ledger.dataVersion=new Date().toISOString().slice(0,10)+'-web';
  unattended.dataVersion=new Date().toISOString().slice(0,10)+'-web';
  manifest.dataVersion=new Date().toISOString().slice(0,10)+'-web';
  manifest.reportFiles=[...new Set(paths)].sort((a,b)=>{
    const ya=a.match(/(\d{4})-/)?.[1]||'',yb=b.match(/(\d{4})-/)?.[1]||'';
    return ya.localeCompare(yb)||reportMonthValue(a)-reportMonthValue(b);
  });

  const changed=[
    [ledgerPath,ledger],
    ['未参加イベント.json',unattended],
    ['実地レポート.json',manifest]
  ];
  for(const pack of reportFiles.values())changed.push([pack.path,pack.obj]);

  const tree=[];
  for(const [path,obj] of changed){
    const blob=await gh('/repos/'+OWNER+'/'+REPO+'/git/blobs',token,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:JSON.stringify(obj,null,2)+'\n',encoding:'utf-8'})
    });
    tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const newTree=await gh('/repos/'+OWNER+'/'+REPO+'/git/trees',token,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({base_tree:baseTree,tree})
  });
  const newCommit=await gh('/repos/'+OWNER+'/'+REPO+'/git/commits',token,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      message:'終了処理: '+e.name+' を'+(d.status==='attended'?'参加済み':'未参加')+'に更新',
      tree:newTree.sha,
      parents:[parentSha]
    })
  });
  try{
    await gh('/repos/'+OWNER+'/'+REPO+'/git/refs/heads/'+BRANCH,token,{
      method:'PATCH',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({sha:newCommit.sha,force:false})
    });
  }catch(err){
    if(err.status===409)throw err;
    throw err;
  }
  return {commit:newCommit.sha,eventId:e.id,status:d.status};
}
