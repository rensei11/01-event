# Japan IT Week 秋2026：出展者名簿取得用データ領域

**現状：全件CSV未取得。ここは作業用ブランチで、本番ではありません。**

- 作業用ブランチ：`codex-jitw-autumn-2026-data`
- 実行指示書の正本：[Issue #1](https://github.com/rensei11/01-event/issues/1)
- 主催者公式名簿：https://www.japan-it.jp/autumn/ja-jp/search/2026a07/directory.html
- 保護対象の本番main開始時点：`34ebd7d8e13b6ee7035ad0dbb70efd1b43220dc4`
- 失敗記録用の別ブランチ：`record-jitw-autumn-2026-failures`

**注意：このREADMEはCodexの起動方法や作業環境を指示しません。** 実際に使用する実行環境に関する唯一の指示書は上記Issueです。GitHubコネクタが使えることと、ローカルGitがチェックアウトされていることは別の事実です。今回の出展者名簿取得にローカルcloneを無条件に要求しないでください。

完了条件：公式の会社名・小間番号・詳細URLが対応した全件CSV、ソート済みCSV、先頭100件CSVを作成し、件数と対応関係を検証すること。試験CSVだけの成功は完了としません。

本番台帳JSON、`index.html`、`確認用.html`には変更を加えません。
