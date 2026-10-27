# waigaya.space - CLAUDE.md

## プロジェクト概要

オンラインイベント等で使えるリアルタイムコメントWebアプリケーション。
参加者がイベントルームに入室し、テキストコメントをリアルタイムで投稿・閲覧できる。
コメントに対して絵文字リアクションを付けることもでき、リアクションもリアルタイムで全参加者に反映される。

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | React 18 + TypeScript + Vite |
| API | AWS AppSync (GraphQL + WebSocket Subscription) |
| Lambda | Node.js 22.x (AWS SDK v3) |
| DB | Amazon DynamoDB |
| ホスティング | S3 + CloudFront (OAC) + Route53 カスタムドメイン |
| IaC | AWS CDK v2 (TypeScript) |
| CI/CD | GitHub Actions (OIDC 認証) |

## ディレクトリ構成

```
waigaya-space/
├── .github/
│   └── workflows/
│       └── deploy.yml                  # GitHub Actions 自動デプロイ
├── cdk/
│   ├── bin/app.ts                      # CDK エントリポイント
│   ├── lib/certificate-stack.ts        # ACM 証明書スタック (us-east-1)
│   ├── lib/waigaya-space-stack.ts      # メインスタック定義
│   ├── lambda/
│   │   ├── create-event/index.ts       # イベント作成 Lambda
│   │   ├── create-comment/index.ts     # コメント投稿 Lambda
│   │   ├── react-to-comment/index.ts  # リアクション Lambda（add/remove）
│   │   └── get-upload-url/index.ts    # 画像アップロード用の署名付き URL 発行 Lambda
│   ├── schema/schema.graphql           # GraphQL スキーマ
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── JoinEvent.tsx    # 参加コード入力画面
│   │   │   ├── CreateEvent.tsx  # イベント作成画面
│   │   │   ├── EventRoom.tsx    # イベントルーム（メイン）
│   │   │   └── CommentList.tsx  # コメント一覧
│   │   ├── graphql/
│   │   │   ├── queries.ts       # getEvent / getEventByCode / listComments
│   │   │   ├── mutations.ts     # createEvent / postComment / closeEvent / reactToComment
│   │   │   └── subscriptions.ts # onCommentPosted / onReactionUpdated
│   │   ├── hooks/useComments.ts # コメント取得 + Subscription フック
│   │   ├── types/index.ts       # Event / Comment 型定義
│   │   ├── vite-env.d.ts        # Vite 環境変数型定義
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── .env                     # AppSync URL / API Key（要設定・Git 管理外）
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

## AWS リソース構成

### CDK スタック

| スタック名 | リージョン | 内容 |
|---|---|---|
| `WaigayaCertStack` | us-east-1 | CloudFront 用 ACM 証明書（初回のみ手動デプロイ） |
| `WaigayaSpaceStack` | ap-northeast-1 | DynamoDB / Lambda / AppSync / S3 / CloudFront / Route53 / OIDC IAM Role |

### DynamoDB

| テーブル名 | PK | SK | GSI |
|---|---|---|---|
| `WaigayaSpace-Events` | `eventId` (String) | なし | `ParticipantCodeIndex` (participantCode) |
| `WaigayaSpace-Comments` | `eventId` (String) | `createdAt` (String) | なし |

- Comments テーブルのソートキー `createdAt` が同じミリ秒でぶつかった場合、`create-comment` は上書きせず 1ms ずらして保存し直す（条件付き書き込み、最大 10 回）
- Comments テーブルの `reactions` 属性は `AWSJSON`（Map 型）で絵文字をキー、カウントを値として保存
- 例: `{ "👍": 3, "❤️": 1 }`

### AppSync リゾルバー

| オペレーション | タイプ | リゾルバー種別 |
|---|---|---|
| `Query.getEvent` | DynamoDB GetItem | DynamoDB 直接 |
| `Query.getEventByCode` | DynamoDB Query (GSI) | DynamoDB 直接 |
| `Query.listComments` | DynamoDB Query | DynamoDB 直接 |
| `Mutation.createEvent` | Lambda | Lambda リゾルバー |
| `Mutation.postComment` | Lambda | Lambda リゾルバー |
| `Mutation.closeEvent` | DynamoDB UpdateItem | DynamoDB 直接 |
| `Mutation.reactToComment` | Lambda | Lambda リゾルバー |
| `Query.getUploadUrl` | Lambda | Lambda リゾルバー |
| `Subscription.onCommentPosted` | `postComment` に `@aws_subscribe` | — |
| `Subscription.onReactionUpdated` | `reactToComment` に `@aws_subscribe` | — |

### CloudFront + S3

- S3 バケットはパブリックアクセス完全ブロック
- OAC (Origin Access Control) で CloudFront からのアクセスのみ許可
- SPA 対応: 403/404 → `index.html` にリダイレクト
- カスタムドメイン: `waigaya.space` / `www.waigaya.space`（Route53 Alias レコード）

## デプロイ

### 通常のデプロイ（自動）

`main` ブランチへ push すると GitHub Actions が自動実行されます。

```
git push origin main
→ CDK deploy WaigayaSpaceStack
→ フロントエンドビルド → S3 sync → CloudFront キャッシュ無効化
```

### GitHub Secrets（要設定）

| Secret 名 | 用途 |
|---|---|
| `AWS_ACCOUNT_ID` | CDK デプロイ先アカウント |
| `OIDC_ROLE_ARN` | GitHub Actions が assume する IAM Role ARN |
| `CERT_ARN` | WaigayaCertStack の証明書 ARN |
| `VITE_APPSYNC_URL` | フロントエンドビルド時の AppSync URL |
| `VITE_APPSYNC_API_KEY` | フロントエンドビルド時の AppSync API Key |

### 初回セットアップ（手動・一度だけ）

詳細は README.md を参照。概要：
1. CDK bootstrap（ap-northeast-1 / us-east-1）
2. `cdk deploy WaigayaCertStack`（証明書作成）
3. GitHub Secrets 登録
4. `cdk deploy WaigayaSpaceStack -c certArn=<ARN>`（OIDC Role 含むインフラ作成）

## 既知の注意事項

### CDK ビルド時

- **Docker 不要**: `NodejsFunction` のバンドリングは `forceDockerBundling: false` + ローカル `esbuild` で実行
- **AWS SDK v3 は external**: Lambda ランタイム (Node.js 22.x) に含まれているため `externalModules: ["@aws-sdk/*"]` を設定済み
- **certArn は必須コンテキスト変数**: `WaigayaSpaceStack` は `-c certArn=<ARN>` なしでは synth されない

### フロントエンド型定義

- `import.meta.env` を使うために `src/vite-env.d.ts` が必要（`/// <reference types="vite/client" />`）
- AppSync Subscription の戻り値は `SubscriptionObservable` インターフェースで `as unknown as` キャストして型解決
- `reactions` は AppSync から文字列で返る場合があるため `parseReactions()` で安全にパース（`AWSJSON` スカラーの挙動）

### 画像添付・URL・入力

- 画像は専用 S3 バケットに署名付き PUT URL で直接アップロードし、コメントには `imageKey`（`images/<uuid>.<ext>`）のみ保存
- 配信は CloudFront の `/images/*`（OAC）。バケットは 4 日で自動削除
- 対応形式は JPEG/PNG/GIF/WebP、5MB 以下（上限チェックはフロントのみ）。画像のみの投稿は不可（テキスト必須）
- CSV には画像を含めず、画像付きコメントは本文末尾に `[画像添付]` を付与
- 入室中の URL は `/e/<参加コード>`。リロード時は `getEventByCode` で復元する
- パソコンでは送信は Enter、改行は Shift+Enter（IME 変換中は送信しない）。指で操作する端末（`pointer: coarse`）では Enter は改行で、送信はボタンのみ
- 入力欄は 1 行から約 6 行まで高さが伸び、添付・送信ボタンは入力欄の枠の下側に並ぶ
- 画像をクリックすると画面上のポップアップで拡大表示する（背景のタップ・✕・Esc で閉じる）
- 入室時はスクロールの動きを見せずに一番下から表示する。入室直後は、利用者が自分でスクロールするまで（最長 10 秒）画像の読み込みで高さが変わっても一番下に合わせ続ける

### リアクション機能

- 絵文字セット: `["👍", "❤️", "😂", "😮", "👏"]`（固定）
- ユーザーのリアクション済み状態は localStorage に `waigaya_reacted_{commentId}` キーで保存（JSON 配列）
- 同じ絵文字を再クリックするとトグル（取り消し）される
- Lambda 側で `action: "add" | "remove"` を受け取り、DynamoDB をアトミックにインクリメント/デクリメント

### ローカル開発の注意

- `npm run dev` は `.env` の AppSync エンドポイント（本番）に接続する
- バックエンド変更（スキーマ・Lambda）を伴う場合は **デプロイ後に動作確認**すること
- ローカルでのテストデータは本番 DynamoDB に保存される（TTL により自動削除）

### セキュリティ

- AppSync 認証方式: API Key（有効期限 365 日）
- API Key は `.env` ファイルで管理（`.env` は `.gitignore` で Git 管理外）
- GitHub Actions の AWS 認証は OIDC（長期 IAM キーを使わない）
