// Cloudflare Worker: 終了処理を GitHub の年間台帳・実地レポートへ確定保存する
// Secrets: GITHUB_TOKEN, EDIT_KEY
// Optional vars: ALLOWED_ORIGIN (default: https://rensei11.github.io)

const OWNER='rensei11';
const REPO='01-event';
const BRANCH='main';
const WORKER_VERSION='2026-09-29-ai-free-v1';

export default {
  async fetch(request, env) {
    const origin=request.headers.get('Origin')||'';
    const allowed=env.ALLOWED_ORIGIN||'https://rensei11.github.io';
    const cors={
      'Access-Control-Allow-Origin': allowed,
      'Access-Control-Allow-Headers':'Content-Type,X-Edit-Key',
      'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
      'Vary':'Origin'
    };
    if(request.method==='OPTIONS'){
      if(origin&&origin!==allowed)return new Response('Forbidden',{status:403});
      return new Response(null,{status:204,headers:cors});
    }
    if(origin&&origin!==allowed)return json({ok:false,error:'許可されていない送信元です'},403,cors);
    const url=new URL(request.url);
    if(request.method==='GET'&&url.pathname==='/version')return json({ok:true,version:WORKER_VERSION},200,cors);
    if(request.method!=='POST'||!['/save','/save-v2'].includes(url.pathname))return json({ok:false,error:'Not found'},404,cors);
    if(!env.GITHUB_TOKEN||!env.EDIT_KEY)return json({ok:false,error:'Workerの初期設定が未完了です'},500,cors);
    if(request.headers.get('X-Edit-Key')!==env.EDIT_KEY)return json({ok:false,error:'編集キーが違います'},401,cors);

    let body;
    try{body=await request.json()}catch{return json({ok:false,error:'送信データを読めません'},400,cors)}
    const v=validate(body);
    if(v)return json({ok:false,error:v},400,cors);

    try{
      const result=body.action?await saveUiOperation(body,env.GITHUB_TOKEN):await saveToGitHub(body,env.GITHUB_TOKEN);
      return json({ok:true,workerVersion:WORKER_VERSION,...result},200,cors);
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
  if(d.action){
    if(d.action==='event_upsert'){
      if(!d.eventId||!(d.eventName||d.name))return 'イベント情報がありません';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d.date||'')))return '開始日が不正です';
      if(d.endDate&&!/^\d{4}-\d{2}-\d{2}$/.test(String(d.endDate)))return '終了日が不正です';
      if(d.endDate&&d.endDate<d.date)return '終了日は開始日以降にしてください';
      if(!['exhibition','gathering'].includes(d.kind))return 'イベント種別が不正です';
      const kinds=Array.isArray(d.kinds)?d.kinds.filter(x=>['exhibition','gathering'].includes(x)):[d.kind];
      if(!kinds.length)return 'イベント区分を1つ以上選んでください';
      return '';
    }
    if(d.action==='event_delete')return d.eventId?'':'イベント情報がありません';
    if(d.action==='planning_state'){
      if(!d.eventId)return 'イベント情報がありません';
      if(!d.planning||typeof d.planning!=='object')return '予定状態が不正です';
      return '';
    }
    if(d.action==='report_flag'){
      if(!d.reportId)return '実地レポート情報がありません';
      if(!['','high','mid','low'].includes(String(d.ratingFlag||'')))return '評価状態が不正です';
      return '';
    }
    if(d.action==='bulk_ui_state'){
      if(d.planningEntries&&!Array.isArray(d.planningEntries))return '予定状態一覧が不正です';
      if(d.reportEntries&&!Array.isArray(d.reportEntries))return '評価状態一覧が不正です';
      return '';
    }
    return '保存操作が不正です';
  }
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


function cleanKinds(d){
  const raw=Array.isArray(d.kinds)?d.kinds:[d.kind];
  const kinds=[...new Set(raw.filter(x=>x==='exhibition'||x==='gathering'))];
  if(!kinds.length&&['exhibition','gathering'].includes(d.kind))kinds.push(d.kind);
  return kinds;
}
function normalizePlanning(p){
  const x=p&&typeof p==='object'?p:{};
  const out={
    planned:!!x.planned,
    interested:!!x.interested,
    ignored:!!x.ignored
  };
  if(out.planned&&out.interested)out.interested=false;
  if(out.ignored){out.planned=false;out.interested=false;}
  if(Array.isArray(x.visitDates)){
    out.visitDates=[...new Set(x.visitDates.filter(v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v))))].sort();
  }
  if(!out.planned&&!out.interested)delete out.visitDates;
  return out;
}
function hasPlanning(p){
  return !!(p&&(p.planned||p.interested||p.ignored||(Array.isArray(p.visitDates)&&p.visitDates.length)));
}
function sortEvents(data){
  data.events=Array.isArray(data.events)?data.events:[];
  data.events.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.name||'').localeCompare(String(b.name||''),'ja'));
}
function findEventInLedgers(gathering,exhibition,id){
  gathering.events=Array.isArray(gathering.events)?gathering.events:[];
  exhibition.events=Array.isArray(exhibition.events)?exhibition.events:[];
  const gi=gathering.events.findIndex(e=>e.id===id);
  const xi=exhibition.events.findIndex(e=>e.id===id);
  if(gi>=0)return {event:gathering.events[gi],kind:'gathering'};
  if(xi>=0)return {event:exhibition.events[xi],kind:'exhibition'};
  return {event:null,kind:''};
}
function removeEventId(data,id){
  data.events=Array.isArray(data.events)?data.events.filter(e=>e.id!==id):[];
}
async function beginWrite(token){
  const ref=await gh('/repos/'+OWNER+'/'+REPO+'/git/ref/heads/'+BRANCH,token);
  const parentSha=ref.object.sha;
  const commit=await gh('/repos/'+OWNER+'/'+REPO+'/git/commits/'+parentSha,token);
  return {parentSha,baseTree:commit.tree.sha};
}
async function commitJsonMap(changed,message,token,ctx){
  const entries=[...changed.entries()];
  if(!entries.length)return {commit:'',changed:[]};
  const tree=[];
  for(const [path,obj] of entries){
    const blob=await gh('/repos/'+OWNER+'/'+REPO+'/git/blobs',token,{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({content:JSON.stringify(obj,null,2)+'\n',encoding:'utf-8'})
    });
    tree.push({path,mode:'100644',type:'blob',sha:blob.sha});
  }
  const newTree=await gh('/repos/'+OWNER+'/'+REPO+'/git/trees',token,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({base_tree:ctx.baseTree,tree})
  });
  const newCommit=await gh('/repos/'+OWNER+'/'+REPO+'/git/commits',token,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({message,tree:newTree.sha,parents:[ctx.parentSha]})
  });
  await gh('/repos/'+OWNER+'/'+REPO+'/git/refs/heads/'+BRANCH,token,{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({sha:newCommit.sha,force:false})
  });
  return {commit:newCommit.sha,changed:entries.map(x=>x[0])};
}
async function loadBaseFiles(token,parentSha,withManifest=false){
  const req=[
    readJson('イベント一覧.json',token,parentSha),
    readJson('展示会一覧.json',token,parentSha),
    readJson('未参加イベント.json',token,parentSha)
  ];
  if(withManifest)req.push(readJson('実地レポート.json',token,parentSha));
  const x=await Promise.all(req);
  return {
    gathering:x[0].json,
    exhibition:x[1].json,
    unattended:x[2].json,
    manifest:withManifest?x[3].json:null
  };
}
async function findReportPack(reportId,manifest,token,parentSha,cache){
  if(!reportId)return null;
  const paths=Array.isArray(manifest?.reportFiles)?manifest.reportFiles:[];
  for(const path of paths){
    let pack=cache.get(path);
    if(!pack){
      const r=await readJson(path,token,parentSha);
      const obj=r.json||{reports:[]};
      obj.reports=Array.isArray(obj.reports)?obj.reports:[];
      pack={path,obj};
      cache.set(path,pack);
    }
    const index=pack.obj.reports.findIndex(r=>r.id===reportId);
    if(index>=0)return {pack,index};
  }
  return null;
}
async function saveUiOperation(d,token){
  if(d.action==='event_upsert')return saveEventUpsert(d,token);
  if(d.action==='event_delete')return saveEventDelete(d,token);
  if(d.action==='planning_state')return savePlanningState(d,token);
  if(d.action==='report_flag')return saveReportFlag(d,token);
  if(d.action==='bulk_ui_state')return saveBulkUiState(d,token);
  const e=new Error('保存操作が不正です');e.status=400;throw e;
}
async function saveEventUpsert(d,token){
  const ctx=await beginWrite(token);
  const base=await loadBaseFiles(token,ctx.parentSha,true);
  base.gathering.events=Array.isArray(base.gathering.events)?base.gathering.events:[];
  base.exhibition.events=Array.isArray(base.exhibition.events)?base.exhibition.events:[];
  base.unattended.events=Array.isArray(base.unattended.events)?base.unattended.events:[];
  const found=findEventInLedgers(base.gathering,base.exhibition,d.eventId);
  const old=found.event?JSON.parse(JSON.stringify(found.event)):null;
  const kinds=cleanKinds(d);
  const primary=kinds.includes(d.kind)?d.kind:kinds[0];
  const e=old||{
    id:d.eventId,
    attendanceStatus:'',
    visitDates:[]
  };
  e.id=d.eventId;
  e.date=String(d.date||'').trim();
  e.endDate=String(d.endDate||d.date||'').trim();
  e.dateText=scheduleDateText(e.date,e.endDate);
  e.name=String(d.eventName||d.name||'').trim();
  e.url=String(d.url||'').trim();
  e.venue=String(d.venue||'').trim();
  const conditionLines=String(d.conditionText||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).filter(x=>!x.startsWith('名前コード：'));
  const personName=String(d.personName||'').trim();
  if(personName)conditionLines.push('名前コード：'+personName);
  e.conditionLines=conditionLines;
  e.rating=String(d.preRating||'').trim();
  e.nightTime=String(d.nightTime||'').trim();
  e.nightText=String(d.nightText||'').trim();
  e._kinds=kinds;
  delete e._kind;
  removeEventId(base.gathering,e.id);
  removeEventId(base.exhibition,e.id);
  (primary==='gathering'?base.gathering.events:base.exhibition.events).push(e);
  sortEvents(base.gathering);sortEvents(base.exhibition);
  const stamp=new Date().toISOString().slice(0,10)+'-web';
  base.gathering.dataVersion=stamp;base.exhibition.dataVersion=stamp;
  const changed=new Map([
    ['イベント一覧.json',base.gathering],
    ['展示会一覧.json',base.exhibition]
  ]);

  const hadUnattended=base.unattended.events.some(x=>x.id===e.id);
  base.unattended.events=base.unattended.events.filter(x=>x.id!==e.id);
  if(e.attendanceStatus==='not_attended')upsertUnattended(base.unattended,e,primary);
  if(hadUnattended||e.attendanceStatus==='not_attended'){
    base.unattended.dataVersion=stamp;
    changed.set('未参加イベント.json',base.unattended);
  }

  if(e.sourceReportId&&base.manifest){
    const cache=new Map();
    const hit=await findReportPack(e.sourceReportId,base.manifest,token,ctx.parentSha,cache);
    if(hit){
      const r=hit.pack.obj.reports[hit.index];
      r.scheduledDate=e.date;
      r.scheduledEndDate=e.endDate||e.date;
      r.scheduledDateText=e.dateText||'';
      r.name=e.name;r.url=e.url||'';r.venue=e.venue||'';
      r.category=primary;r._kinds=kinds;
      changed.set(hit.pack.path,hit.pack.obj);
    }
  }
  const saved=await commitJsonMap(changed,'イベント保存: '+e.name,token,ctx);
  return {status:'event_saved',eventId:e.id,kind:primary,kinds,commit:saved.commit};
}
async function saveEventDelete(d,token){
  const ctx=await beginWrite(token);
  const base=await loadBaseFiles(token,ctx.parentSha,true);
  const found=findEventInLedgers(base.gathering,base.exhibition,d.eventId);
  if(!found.event){const er=new Error('対象イベントが年間台帳に見つかりません');er.status=409;throw er}
  const e=JSON.parse(JSON.stringify(found.event));
  removeEventId(base.gathering,e.id);removeEventId(base.exhibition,e.id);
  base.unattended.events=Array.isArray(base.unattended.events)?base.unattended.events.filter(x=>x.id!==e.id):[];
  const stamp=new Date().toISOString().slice(0,10)+'-web';
  base.gathering.dataVersion=stamp;base.exhibition.dataVersion=stamp;base.unattended.dataVersion=stamp;
  const changed=new Map([
    ['イベント一覧.json',base.gathering],
    ['展示会一覧.json',base.exhibition],
    ['未参加イベント.json',base.unattended]
  ]);
  if(e.sourceReportId&&base.manifest){
    const cache=new Map();
    const hit=await findReportPack(e.sourceReportId,base.manifest,token,ctx.parentSha,cache);
    if(hit){
      hit.pack.obj.reports=hit.pack.obj.reports.filter(r=>r.id!==e.sourceReportId);
      changed.set(hit.pack.path,hit.pack.obj);
    }
  }
  const saved=await commitJsonMap(changed,'イベント削除: '+String(e.name||e.id),token,ctx);
  return {status:'event_deleted',eventId:e.id,commit:saved.commit};
}
async function savePlanningState(d,token){
  const ctx=await beginWrite(token);
  const base=await loadBaseFiles(token,ctx.parentSha,false);
  const found=findEventInLedgers(base.gathering,base.exhibition,d.eventId);
  if(!found.event){const er=new Error('対象イベントが年間台帳に見つかりません');er.status=409;throw er}
  const p=normalizePlanning(d.planning);
  if(hasPlanning(p))found.event.planning=p;else delete found.event.planning;
  if(p.ignored){
    found.event.conditionLines=(found.event.conditionLines||[]).filter(x=>!String(x).startsWith('名前コード：'));
  }
  const ledger=found.kind==='gathering'?base.gathering:base.exhibition;
  ledger.dataVersion=new Date().toISOString().slice(0,10)+'-web';
  const path=found.kind==='gathering'?'イベント一覧.json':'展示会一覧.json';
  const saved=await commitJsonMap(new Map([[path,ledger]]),'予定状態: '+String(found.event.name||found.event.id),token,ctx);
  return {status:'planning_saved',eventId:found.event.id,planning:p,commit:saved.commit};
}
async function saveReportFlag(d,token){
  const ctx=await beginWrite(token);
  const manifest=(await readJson('実地レポート.json',token,ctx.parentSha)).json;
  const cache=new Map();
  const hit=await findReportPack(d.reportId,manifest,token,ctx.parentSha,cache);
  if(!hit){const er=new Error('対象実地レポートが見つかりません');er.status=409;throw er}
  const v=String(d.ratingFlag||'');
  if(v)hit.pack.obj.reports[hit.index].ratingFlag=v;else delete hit.pack.obj.reports[hit.index].ratingFlag;
  const saved=await commitJsonMap(new Map([[hit.pack.path,hit.pack.obj]]),'評価補助: '+String(hit.pack.obj.reports[hit.index].name||d.reportId),token,ctx);
  return {status:'report_flag_saved',reportId:d.reportId,ratingFlag:v,commit:saved.commit};
}
async function saveBulkUiState(d,token){
  const ctx=await beginWrite(token);
  const base=await loadBaseFiles(token,ctx.parentSha,true);
  const changed=new Map();
  let planningCount=0,reportCount=0;
  for(const item of (Array.isArray(d.planningEntries)?d.planningEntries:[])){
    if(!item||!item.eventId)continue;
    const found=findEventInLedgers(base.gathering,base.exhibition,item.eventId);
    if(!found.event)continue;
    const p=normalizePlanning(item.planning);
    if(hasPlanning(p))found.event.planning=p;else delete found.event.planning;
    if(p.ignored)found.event.conditionLines=(found.event.conditionLines||[]).filter(x=>!String(x).startsWith('名前コード：'));
    const ledger=found.kind==='gathering'?base.gathering:base.exhibition;
    ledger.dataVersion=new Date().toISOString().slice(0,10)+'-web';
    changed.set(found.kind==='gathering'?'イベント一覧.json':'展示会一覧.json',ledger);
    planningCount++;
  }
  const reportEntries=Array.isArray(d.reportEntries)?d.reportEntries:[];
  if(reportEntries.length&&base.manifest){
    const wanted=new Map(reportEntries.filter(x=>x&&x.reportId).map(x=>[x.reportId,String(x.ratingFlag||'')]));
    const paths=Array.isArray(base.manifest.reportFiles)?base.manifest.reportFiles:[];
    for(const path of paths){
      if(!wanted.size)break;
      const rr=await readJson(path,token,ctx.parentSha);
      const obj=rr.json||{reports:[]};obj.reports=Array.isArray(obj.reports)?obj.reports:[];
      let touched=false;
      for(const rep of obj.reports){
        if(!wanted.has(rep.id))continue;
        const v=wanted.get(rep.id);
        if(['high','mid','low'].includes(v))rep.ratingFlag=v;else delete rep.ratingFlag;
        wanted.delete(rep.id);touched=true;reportCount++;
      }
      if(touched)changed.set(path,obj);
    }
  }
  if(!changed.size)return {status:'bulk_saved',planningCount:0,reportCount:0,commit:''};
  const saved=await commitJsonMap(changed,'台帳状態をGitHubへ保存',token,ctx);
  return {status:'bulk_saved',planningCount,reportCount,commit:saved.commit};
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
    e.conditionLines=(e.conditionLines||[]).filter(x=>!String(x).startsWith('名前コード：'));
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
