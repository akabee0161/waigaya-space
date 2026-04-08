# waigaya.space - CLAUDE.md

## プロジェクト概要

オンラインイベント等で使えるリアルタイムコメントWebアプリケーション。
参加者がイベントルームに入室し、テキストコメントをリアルタイムで投稿・閲覧できる。
コメントに対して絵文字リアクションを付けることもでき、リアクションもリアルタイムで全参加者に反映される。

タグ機能により、参加者がテーマ別に発言を分類し、自分のタグのコメントのみ表示するフィルタリングが可能。管理者は全参加者のタグを一斉変更（ブロードキャスト）できる。

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
│   │   └── set-event-tags/index.ts    # タグ一覧更新 Lambda
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

- Comments テーブルの `reactions` 属性は `AWSJSON`（Map 型）で絵文字をキー、カウントを値として保存
- 例: `{ "👍": 3, "❤️": 1 }`
- Events テーブルの `tags` 属性は文字列リスト（管理者が設定したタグ一覧）
- Events テーブルの `currentTag` 属性は管理者が全員にブロードキャストした現在のタグ（nullable）
- Comments テーブルの `tag` 属性はコメント投稿時に選択されたタグ（nullable）

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
| `Mutation.setEventTags` | Lambda | Lambda リゾルバー |
| `Mutation.broadcastTag` | DynamoDB UpdateItem | DynamoDB 直接 |
| `Subscription.onCommentPosted` | `postComment` に `@aws_subscribe` | — |
| `Subscription.onReactionUpdated` | `reactToComment` に `@aws_subscribe` | — |
| `Subscription.onTagBroadcast` | `broadcastTag` に `@aws_subscribe` | — |

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

### リアクション機能

- 絵文字セット: `["👍", "❤️", "😂", "😮", "👏"]`（固定）
- ユーザーのリアクション済み状態は localStorage に `waigaya_reacted_{commentId}` キーで保存（JSON 配列）
- 同じ絵文字を再クリックするとトグル（取り消し）される
- Lambda 側で `action: "add" | "remove"` を受け取り、DynamoDB をアトミックにインクリメント/デクリメント

### ローカル開発の注意

- `npm run dev` は `.env` の AppSync エンドポイント（本番）に接続する
- バックエンド変更（スキーマ・Lambda）を伴う場合は **デプロイ後に動作確認**すること
- ローカルでのテストデータは本番 DynamoDB に保存される（TTL により自動削除）

### タグ機能

- タグ一覧は Event ごとに管理者が設定（`setEventTags` Mutation）
- タグは保存時に正規化される（トリム・空文字除去・重複排除）
- 参加者は管理者が設定したタグ一覧の中からのみ選択できる
- コメント投稿時に Lambda 側でタグを検証し、一覧に存在しないタグはエラー
- 管理者は `broadcastTag` で全参加者のタグを一斉変更。DynamoDB の condition で一覧外タグのブロードキャストを防止
- `setEventTags` でタグ一覧を更新した際、`currentTag` が新しい一覧に含まれない場合は自動でクリア
- 参加者の現在タグは localStorage で管理（`waigaya_current_tag_{eventId}` キー）
- `onTagBroadcast` Subscription で管理者のブロードキャストをリアルタイムに受信し localStorage を更新

### 管理者とセキュリティ

- **管理者の判定はクライアントサイドのみ**: イベント作成者の `eventId` を localStorage に保存することで管理者を識別
- **Cognito などによるサーバーサイド認可は現段階では実装しない**。このアプリの用途（小規模オンラインイベント向け簡易ツール）では過剰なため、意図的に除外している
- AppSync 認証方式: API Key（有効期限 365 日）
- API Key は `.env` ファイルで管理（`.env` は `.gitignore` で Git 管理外）
- GitHub Actions の AWS 認証は OIDC（長期 IAM キーを使わない）
