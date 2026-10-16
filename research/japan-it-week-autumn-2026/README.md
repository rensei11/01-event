# Japan IT Week 秋2026：公式出展者名簿（全件取得・全件小間番号順）

**現在：出展者名簿のCSVは未取得。** このブランチは本番台帳から分離した作業領域。

- 指示書の唯一の正本：[GitHub Issue #1](https://github.com/rensei11/01-event/issues/1)
- 公式検索元：https://www.japan-it.jp/autumn/ja-jp/search/2026a07/directory.html
- 成功候補のブランチ：`codex-jitw-autumn-2026-data`
- 本番mainの保護基準SHA：`34ebd7d8e13b6ee7035ad0dbb70efd1b43220dc4`
- 失敗記録専用ブランチ：`record-jitw-autumn-2026-failures`

## 必要な成果物（全件のみ）
- `exhibitors_raw.csv`：全件の掲載順。出展社名、小間番号、公式詳細URL、出典、掲載順。
- `exhibitors_sorted.csv`：**全件を小間番号の自然順に並べ替えたもの**。原データと同じ件数・対応関係。
- `RESULT.md`：実取得数、重複・未取得数、公式との照合、ソートの方法。

**先頭100件のCSVや100件ずつの企業調査は一切不要。** 100社単位のノベルティ調査は、この全件名簿が完成した後に通常ChatGPTが担当する。

## 過去の確認結果の扱い
Codexによって実際にGitHubへ保存されたのは**失敗記録用の別ブランチの `blocked.md`**であり、名簿データの保存用ブランチへのCodex自身の書込みはまだ未確認。GitHubでREADMEを作成できたことや一時テストCSVが保存できたことを、名簿全件CSVの保存成功と呼ばない。

本番の `main`、`index.html`、`確認用.html`、イベントJSONには触れない。
