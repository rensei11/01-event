# Japan IT Week 秋2026：出展者全件CSV

現在：**出展者616カードは前回Codexブラウザー内で確認。全件CSVは未完成。**
2026-10-16 のattempt-03では、作業ブランチ `codex-jitw-autumn-2026-data` に実在する1社分の `write-path-check.csv` をGitHub Contents APIで保存・読み戻し成功（commit `0b472aa4404ae34176c831adcf155dbf8cdd2fa1`）。GitHub書込みは成立する。ブラウザーの取得データを外部ファイルへ移す手段が未成立。

**正本の実行指示**：[Issue #1 — Microsoft/Playwright/Node.js/GitHub公式のファイル出力・保存手順](https://github.com/rensei11/01-event/issues/1)

## 公式に確認した解決経路
1. Microsoft Playwright MCPの `browser_evaluate` に備わる `filename` 引数で、ブラウザーの評価結果をファイルへ直接保存する（**そのツールが現在のCodexで実際に使える場合のみ**）。
2. 使えなければPlaywrightの `page.evaluate()` でページ内の値を同じPlaywright側のNode.jsプログラムに返し、Node.jsの `fs.writeFile()` で保存する。
3. 上記が現行環境で利用できない場合は、Web標準のBlobファイル生成とPlaywrightの `download.saveAs()` を使えるか最小確認。

数の多さが失敗原因とは確認されていない。**手動で数百件をAI回答・Windowsクリップボード経由で転送する方式を既定にしない。** 新しいパッケージやMCPの無断追加、認証回避、危険なコード実行はしない。

## 最終成果物（全件のみ）
- `exhibitors_raw.csv` — 公式カード掲載順の**全件**
- `exhibitors_sorted.csv` — **全件の小間番号自然順**
- `RESULT.md` — 実数・重複・欠落・並び替えの検証

先頭100件の派生ファイルやノベルティ調査は今回作成しない。成功成果物は `codex-jitw-autumn-2026-data` の `research/japan-it-week-autumn-2026/` に限定する。失敗記録は別の `record-jitw-autumn-2026-failures` に新規作成し、本番main・台帳・UIは変更禁止。

## 公式資料
- Microsoft Playwright MCP README: https://github.com/microsoft/playwright-mcp
- Playwright evaluate: https://playwright.dev/docs/evaluating
- Node.js ファイル操作: https://nodejs.org/api/fs.html
- Playwright download: https://playwright.dev/docs/downloads
- GitHub Contents API（日本語）: https://docs.github.com/ja/rest/repos/contents
