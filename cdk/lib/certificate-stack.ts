import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";

export class CertificateStack extends cdk.Stack {
  public readonly certificateArn: string;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: "waigaya.space",
    });

    const certificate = new acm.Certificate(this, "Certificate", {
      domainName: "waigaya.space",
      subjectAlternativeNames: ["www.waigaya.space"],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    this.certificateArn = certificate.certificateArn;

    new cdk.CfnOutput(this, "CertificateArn", {
      value: certificate.certificateArn,
      description: "ACM Certificate ARN for waigaya.space (us-east-1)",
      exportName: "WaigayaSpaceCertificateArn",
    });
  }
}
