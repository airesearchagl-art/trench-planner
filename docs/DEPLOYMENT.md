# 公開構成

- GitHub：`airesearchagl-art/trench-planner`（Public。2026-10-13に利用者指定で公開へ変更）
- 公開URL：https://trench-planner.vercel.app/
- Vercelチーム：`airesearchagl's projects` / `airesearchagls-projects`
- プロジェクト：`trench-planner`
- フレームワーク：Vite、出力：dist、ビルド：npm run build
- サーバー・DB・APIキー：不要

## 初回公開の確認

2026-10-13（JST）にGit連携を設定し、ProductionのREADYと公開URLのHTTP 200を確認。初版のコミット `a0168b8` で、下膳室見直し案300mm・調理室混合勾配案450mm・GT2箇所一律1/50案400mmを公開画面上でも再現し、ブラウザエラーは0件だった。

初回作成ツールの案内はPreviewだったが、実際のデプロイ情報はProduction。運用上の現在値は実際のデプロイ情報を正とする。

## 手順

1. `npm ci`、`npm run check`、`npm run test:e2e` を通す。
2. GitHubへpushする。
3. Vercelに当該リポジトリを接続してPreviewを作る。
4. デプロイ対象のコミット・チーム・プロジェクトと状態を確認する。
5. Previewで計算・保存・図・出力を確認する。

公開先は入力を受け取るAPIを持たない。ブラウザ内保存はオリジン単位のため、Preview URLとProduction URLで別保存となる。JSONで移行する。

Git連携後のProductionブランチへのpushは自動公開につながる可能性がある。以後の変更は作業ブランチとPRで確認し、公開意図のある変更をmainへ反映する。

認証情報は環境・公式接続に保持し、このリポジトリへ書き込まない。

## 自動テストの有効化

2026-10-13時点のGitHub CLI認証に `workflow` 権限がなく、ワークフローのpushはGitHubに拒否された。アプリ本体の登録を進めるため、設定は `ci/github-check.yml.example` に有効化前のひな形として保存している。GitHub Actionsは現時点で未有効化。

利用者がworkflow権限を追加した後、このひな形を `.github/workflows/check.yml` に移して有効化する。認証の追加は公式のGitHubログインフローを使用する。M0ではローカルで計算14件、ブラウザ操作4件、ビルドを確認済み。
