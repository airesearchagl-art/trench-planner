# 自動チェックのひな形

`github-check.yml.example` はまだ実行されません。GitHub認証にworkflow権限が追加された後、`.github/workflows/check.yml` として配置します。

型検査・計算テスト・ビルド・ブラウザ操作をチェックする構成です。現時点では `npm run check` と `npm run test:e2e` をローカルで実行してください。
