# Japan IT Week 秋2026：出展者全件CSV

**全件CSV未完成。** Codexによる616カードのブラウザー内取得と、実在する1社の成功ブランチへのGitHub API書込みは確認済み。ブラウザーの値を外へ渡す部分が未解決。

## 作業指示の正本
[GitHub Issue #1：A→Bの異なる転送方法を連続実行](https://github.com/rensei11/01-event/issues/1)

- 公式一覧：https://www.japan-it.jp/autumn/ja-jp/search/2026a07/directory.html
- 成果物専用：`codex-jitw-autumn-2026-data`
- 失敗記録専用：`record-jitw-autumn-2026-failures`
- 1社分のGitHub保存成功：`write-path-check.csv`（commit `0b472aa4404ae34176c831adcf155dbf8cdd2fa1`）
- 過去の616カード、ユニーク609 URL、重複7件はattempt-03の観測値。最新一覧は変動し得る。

**最終成果物**：`exhibitors_raw.csv`（全件掲載順）、`exhibitors_sorted.csv`（全件小間番号自然順）、`RESULT.md`（件数・検証）。**先頭100件や企業別ノベルティ調査はCodexの仕事ではない**。

## 具体的な次工程
1. A：ブラウザー実データ2～5行を**ツール出力テキスト**として取り出し、GitHub APIへ渡す。可能なら小分けで続けて全件を保存する。
2. **Aが通らなければBへ**：ブラウザー／Nodeの許可されたファイル書込み、または標準ダウンロードからCodexが読めるファイルを作れるか最小実証。可能なら一括の全件CSVを保存する。
3. どちらも失敗なら、失敗記録だけでなく、通った操作、保存できた実データ、環境境界、未検証の次経路を明記。通常ChatGPTが次の経路を判断する。

データ量が多いことが失敗原因だと断定しない。GmailOTP、台帳JSON、本番main、index.html、確認用.htmlを変更しない。
