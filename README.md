# waigaya.space

オンラインイベント等で使えるリアルタイムコメント Web アプリケーション

## アーキテクチャ

```
参加者ブラウザ
    │
    ▼
CloudFront (HTTPS) ← waigaya.space (Route53 + ACM)
    │
    ├── S3 (静的ファイル: React アプリ)
    │
    └── AppSync (GraphQL API)
            ├── Query/Mutation ──► DynamoDB
            ├── Mutation.createEvent ──► Lambda ──► DynamoDB
            ├── Mutation.postComment ──► Lambda ──► DynamoDB
            └── Subscription (WebSocket) ──► リアルタイム配信
```

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

---

## デプロイフロー

`main` ブランチへの push をトリガーに GitHub Actions が自動でデプロイします。

```
git push origin main
    │
    ▼
GitHub Actions
    ├── cdk deploy WaigayaSpaceStack  (インフラ更新)
    └── npm run build → S3 sync → CloudFront 無効化  (フロントエンド更新)
```

---

## 初回セットアップ（リポジトリ管理者向け）

> 一度だけ実行が必要な手順です。以降のデプロイは GitHub Actions が自動で行います。

### 前提条件

- Node.js 22.x 以上
- AWS CLI 設定済み（`aws configure`）
- AWS CDK CLI: `npm install -g aws-cdk`

### Step 1: CDK ブートストラップ（各リージョン・初回のみ）

```bash
cd cdk
npm install

# メインリージョン (ap-northeast-1)
cdk bootstrap aws://<ACCOUNT_ID>/ap-northeast-1

# 証明書用リージョン (us-east-1)
cdk bootstrap aws://<ACCOUNT_ID>/us-east-1
```

### Step 2: ACM 証明書のデプロイ（us-east-1・初回のみ）

CloudFront に使用する TLS 証明書を us-east-1 に作成します。
Route53 の `waigaya.space` ホストゾーンが事前に存在している必要があります。

```bash
cd cdk
cdk deploy WaigayaCertStack
```

デプロイ完了後、出力の `CertificateArn` を控えておきます。

```
Outputs:
WaigayaCertStack.CertificateArn = arn:aws:acm:us-east-1:XXXXXXXXXXXX:certificate/...
```

### Step 3: GitHub Secrets の登録

リポジトリの Settings → Secrets and variables → Actions に以下を登録します。

| Secret 名 | 値 |
|---|---|
| `AWS_ACCOUNT_ID` | AWS アカウント ID |
| `OIDC_ROLE_ARN` | Step 4 で作成する IAM Role の ARN |
| `CERT_ARN` | Step 2 で取得した CertificateArn |
| `VITE_APPSYNC_URL` | CDK デプロイ後の AppSync API URL |
| `VITE_APPSYNC_API_KEY` | CDK デプロイ後の AppSync API Key |

### Step 4: OIDC IAM Role のデプロイ

GitHub Actions が AWS に安全に認証するための IAM Role を CDK で作成します。

```bash
cd cdk
cdk deploy WaigayaSpaceStack -c certArn=<Step2のCertificateArn>
```

デプロイ後に出力される `OidcRoleArn` を Step 3 の `OIDC_ROLE_ARN` に登録します。

### Step 5: 初回フロントエンドデプロイ

`VITE_APPSYNC_URL` / `VITE_APPSYNC_API_KEY` を GitHub Secrets に登録後、
`main` ブランチに push すると GitHub Actions が自動デプロイします。

---

## ローカル開発

```bash
cd frontend
cp .env.example .env
# .env に AppSync URL / API Key を設定

npm install
npm run dev
```

`http://localhost:5173` でアクセスできます。

---

## アプリの使い方

### イベント主催者

1. トップページで「新しいイベントを作成」をクリック
2. イベント名・説明を入力して作成
3. 表示される **6桁の参加コード** を参加者に共有

### 参加者

1. トップページの入力欄に参加コードを入力
2. 「入室する」をクリック
3. 名前とコメントを入力して送信（同室の全員にリアルタイム反映）

---

## インフラ削除

```bash
cd cdk
cdk destroy WaigayaSpaceStack
cdk destroy WaigayaCertStack
```

> **注意**: `RemovalPolicy.DESTROY` を設定しているため、DynamoDB テーブルのデータも削除されます。

---

## ファイル構成

```
waigaya-space/
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Actions 自動デプロイ
├── cdk/
│   ├── bin/
│   │   └── app.ts                # CDK エントリポイント
│   ├── lib/
│   │   ├── certificate-stack.ts  # ACM 証明書スタック (us-east-1)
│   │   └── waigaya-space-stack.ts # メインスタック定義
│   ├── lambda/
│   │   ├── create-event/index.ts  # イベント作成 Lambda
│   │   └── create-comment/index.ts # コメント投稿 Lambda
│   ├── schema/
│   │   └── schema.graphql        # GraphQL スキーマ
│   ├── cdk.json
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── JoinEvent.tsx     # 参加コード入力画面
│   │   │   ├── CreateEvent.tsx   # イベント作成画面
│   │   │   ├── EventRoom.tsx     # イベントルーム（メイン）
│   │   │   └── CommentList.tsx   # コメント一覧
│   │   ├── graphql/
│   │   │   ├── queries.ts        # GraphQL クエリ
│   │   │   ├── mutations.ts      # GraphQL ミューテーション
│   │   │   └── subscriptions.ts  # GraphQL サブスクリプション
│   │   ├── hooks/
│   │   │   └── useComments.ts    # コメント取得・購読フック
│   │   ├── types/index.ts        # 型定義
│   │   ├── App.tsx               # アプリルート
│   │   └── main.tsx              # エントリポイント
│   ├── .env.example
│   ├── package.json
│   └── vite.config.ts
└── README.md
```
