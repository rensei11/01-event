# Japan IT Week 秋2026 出展者CSV — attempt-04 (通常ChatGPT)

実行日: 2026-10-16 (JST)
状態: **未完了（全件取得・全件CSV作成なし）**
対象: https://github.com/rensei11/01-event/issues/1

## 読み込んだ正本と実在ファイル
- `04-brain/中核ルール.md` current main SHA: `382128e1881cad432892f0a41097ee5ad6814f2e`
- `01-event/引き継ぎ.md` SHA: `2943073bb82467dae0b4f064758f6b03c7d408f5`
- `01-event/調査引き継ぎ.md` SHA: `dc9248e93c5ad4df93b9bf5ac1c0f7945de54f99`
- `01-event/Japan IT Week 秋2026・調査引き継ぎ.md` SHA: `b8ce82961775a368cbf2572bb8beca242c74c18c`
- Issue #1の2026-10-16最新本文、保存ブランチREADME、attempt-03/RESULT.mdを取得。
- GitHubツリー（`codex-jitw-autumn-2026-data` と `record-jitw-autumn-2026-failures`）の関連パスを検査。保存ブランチには `write-path-check.csv` の実在1件とREADMEが存在。未完成の `exhibitors_raw.csv` / `exhibitors_sorted.csv` は存在しない。失敗ブランチにも616件の生データ保存は見つからない。

## 公式手段 A/B/C の検証（今回の環境）
- A Microsoft Playwright MCPの公式READMEで `browser_evaluate(function, filename)` のファイル出力機能の存在を確認: https://github.com/microsoft/playwright-mcp 。ただし、この通常ChatGPTセッションで使用可能な連携ツール一覧には当該browser_evaluate/ブラウザ操作MCPがなく、実ツールでの2〜5社ファイル出力は**実行不可**。
- B Playwright公式が `page.evaluate()` のブラウザ→実行環境への返値転送をサポートすることを確認: https://playwright.dev/docs/evaluating 。Node.js公式 `fs.writeFile`: https://nodejs.org/api/fs.html 。このコンテナにはPlaywright PythonパッケージとChromiumが既存導入済みで、仮のHTMLに対してevaluateで1行を抽出できた。しかし**公式サイトへの直接接続は不可**。コマンドラインcurlでは `Could not resolve host: www.japan-it.jp` 、実際のChromium/Playwrightの `page.goto('https://www.japan-it.jp/autumn/ja-jp/search/2026a07/directory.html')` は `net::ERR_BLOCKED_BY_ADMINISTRATOR`。このため公式616件を今回の実行環境へ転送できない。
- C Playwright公式が `page.waitForEvent('download')` と `download.saveAs()` をサポートすることを確認: https://playwright.dev/docs/downloads 。ただしCも同じ公式ページへのブラウザアクセスが必要であり、今回の接続遮断下では実データ試験不可。
- Web検索経由では公式ディレクトリが確認できるが、Web側の現在のページ本文には出展者カードの動的部分が含まれず（70行程度の静的本文）、そこから全件取得したと宣言できない。
- ローカルの模擬HTMLでPlaywright `page.evaluate` 抽出を1件確認。模擬2社・複数小間のCSV BOM・自然順・読み戻し処理も試験成功。ただしこれは**実出展社2〜5件のPASSではない**ので全件移行の条件未達。

## 判断・未完了事項
- 前回の「616掲載カード、異なる詳細URL609、重複7」はattempt-03の過去観測値であり、今回再取得していない。現在の総件数として確定扱いしない。
- **GitHubへの保存権限は過去の実データ1件書込み成功で立証済み**。問題は実データを取得可能なブラウザ実行環境からファイルとして取り出す経路。このチャットでのAツール不在とB/Cネットワーク遮断が現在の障害。
- 全件CSVを空データや推定値で作成しない。成功ブランチ・本番main・台帳・UIには書込み無し。Work / Codex使用無し、新規MCP・パッケージ導入無し、認証回避無し。
- 次に本件を実行する際は、公式ページへ接続済みで、`browser_evaluate(filename)` を使える**既存の**ブラウザ連携環境の実ツール有無を最初に確かめる。無ければ同一の `page.evaluate` → `fs.writeFile` が実行できる環境か確認し、実在2〜5件のファイル出力・読み戻しPASS後に全件へ移る。今回の隔離環境でDNS/curl/Playwrightを再試行しても接続制限は解消しない。
