#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { WaigayaSpaceStack } from "../lib/waigaya-space-stack";
import { CertificateStack } from "../lib/certificate-stack";

const app = new cdk.App();

// =========================================================
// Step 1: ACM 証明書スタック (us-east-1)
//   cdk deploy WaigayaCertStack
//   → 出力の CertificateArn をメモする
// =========================================================
new CertificateStack(app, "WaigayaCertStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: "us-east-1",
  },
  description: "waigaya.space - ACM Certificate (us-east-1 for CloudFront)",
});

// =========================================================
// Step 2: メインスタック (ap-northeast-1)
//   cdk deploy WaigayaSpaceStack -c certArn=<CertificateArn>
// =========================================================
const certArn = app.node.tryGetContext("certArn") as string | undefined;

if (certArn) {
  new WaigayaSpaceStack(app, "WaigayaSpaceStack", {
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION ?? "ap-northeast-1",
    },
    description: "waigaya.space - Real-time comment app for online events",
    certificateArn: certArn,
  });
} else {
  console.warn(
    "[WaigayaSpaceStack] スキップ: certArn が未指定です。\n" +
      "WaigayaCertStack デプロイ後に以下で実行してください:\n" +
      "  cdk deploy WaigayaSpaceStack -c certArn=<CertificateArn>"
  );
}
