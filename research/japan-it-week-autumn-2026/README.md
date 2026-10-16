# Japan IT Week 秋2026：公式出展者名簿・全件小間番号順CSV化

**状態：Codexによるブラウザー内616カード収集と、成功成果物ブランチへの1社分の書込みは実証済み。全件CSVは未作成。**

- **現在の作業指示の唯一の正本：[GitHub Issue #1](https://github.com/rensei11/01-event/issues/1)**（attempt-03を踏まえたデータ小分け転送方式）
- 公式一覧：https://www.japan-it.jp/autumn/ja-jp/search/2026a07/directory.html
- 成功候補ブランチ：`codex-jitw-autumn-2026-data`
- 失敗記録専用ブランチ：`record-jitw-autumn-2026-failures`
- 実証済みの1社分CSV：`write-path-check.csv`（commit `0b472aa4404ae34176c831adcf155dbf8cdd2fa1`）
- attempt-03実測：ブラウザー内616カード、ユニーク詳細URL609、重複URL7、複数小間3カード展開済み。しかしブラウザーから全件のCSVファイルへデータを渡す経路で失敗。

## 最終的な成果物
- `exhibitors_raw.csv` — 全件の原掲載順
- `exhibitors_sorted.csv` — **全件の小間番号自然順**
- `RESULT.md` — 件数、重複、欠落チェックの結果

**先頭100件CSVは不要。** 100社ずつのノベルティ調査は、全件データ完成後に通常ChatGPTが担当。

## 今回の転送方法
ブラウザーREPLで取得した実データを、10～25行・数千文字以下の短いJSONテキストとして出力し、CodexがそのテキストをGitHub Contents API `create_file` の `content` に渡す。出力ごとに `staging/part_XXXX.json` へ新規保存・GitHubから読み戻す。**ローカルGit checkout、GitHub Webへのログイン、Windowsクリップボードは不要**。全件part保存後、結合・ソートして最終CSVとする。途中失敗時は既存partを保護し、続きから再開する。

`main`、`index.html`、`確認用.html`、台帳JSON、別案件フォルダーは変更しない。
