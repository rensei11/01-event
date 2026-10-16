# Japan IT Week秋2026 出展者一覧 結果

## 取得・照合

作業途中で公式一覧が619件から617件へ変化した。
そのため旧バッチを最終成果物には使用せず、617件確認後に `current-617/` として全件を再取得した。

| 項目 | 結果 |
|---|---:|
| 最終公式カード総数 | 617 |
| source_order | 1〜617連続、欠番0、重複0 |
| 会社名欠落 | 0 |
| 小間番号欠落 | 0 |
| 詳細URL欠落 | 0 |
| ユニーク詳細URL数 | 612 |
| 重複詳細URLカード数 | 5 |
| 最終出展者数（URL重複統合後） | 612 |
| 複数小間の出展者数 | 40 |
| raw CSVデータ行数（ヘッダー除外） | 612 |
| sorted CSVデータ行数（ヘッダー除外） | 612 |

公式DOMから掲載順に50件単位で13バッチ（最後のバッチは17件）を取得した。各バッチをGitHubへ保存した後に読み戻し、件数・source_order範囲・必須項目欠落を確認した。最終13バッチの合計は617件。

同一の `exhibitor_detail_url` を持つカードは統合し、source_orderと会社名は初出カードの値を採用した。小間番号は全カード分を結合し、同じ小間番号は重複除去した。

## 成果物とGitHubコミット

ブランチ: `codex-jitw-autumn-2026-data`

- `research/japan-it-week-autumn-2026/current-617/batch-0001.json`〜`batch-0013.json`: 最終バッチ保存コミット `986109c2071aa015239ec6e9bdcfe494f159f342`
- `research/japan-it-week-autumn-2026/exhibitors_raw.csv`: `0166621da822aa2a49dbee7bf465bd6112c7a227`
- `research/japan-it-week-autumn-2026/exhibitors_sorted.csv`: `ed41435e90955e91db1faf4959bed7312160b6c9`

CSVはUTF-8 BOM付き。rawは初出掲載順、sortedは小間番号の自然順で、小間番号が複数ある場合は各番号の自然順で記録した。


## 追加検証・修正（2026-10-17）

通常ChatGPT側でGitHub保存済みCSVを再検証し、以下を修正した。

- 複数小間40社のうち24社で、セル内の小間番号が自然順ではなかったため自然順へ修正。
- 当初仕様の `source_url` 列が欠落していたため、raw / sorted の両CSVへ公式一覧URLを追加。
- sorted CSVは各出展者の最小小間番号を主キーとして自然順に再生成。
- 612行、612ユニーク詳細URL、raw / sorted のURL集合一致は維持。

修正コミット:
- raw CSV: `517b1c854cfa92656b430ccef3d47a5cd46756ad`
- sorted CSV: `916fde223791b4db82657279b0f68fa305bf2fc0`
