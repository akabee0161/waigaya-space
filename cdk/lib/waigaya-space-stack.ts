import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as path from "path";

export interface WaigayaSpaceStackProps extends cdk.StackProps {
  /** us-east-1 で発行した ACM 証明書の ARN (cdk deploy -c certArn=... で渡す) */
  certificateArn: string;
}

export class WaigayaSpaceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: WaigayaSpaceStackProps) {
    super(scope, id, props);

    const { certificateArn } = props;

    // =========================================================
    // DynamoDB テーブル
    // =========================================================
    const eventsTable = new dynamodb.Table(this, "EventsTable", {
      tableName: "WaigayaSpace-Events",
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // participantCode でのルックアップ用 GSI
    eventsTable.addGlobalSecondaryIndex({
      indexName: "ParticipantCodeIndex",
      partitionKey: {
        name: "participantCode",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    const commentsTable = new dynamodb.Table(this, "CommentsTable", {
      tableName: "WaigayaSpace-Comments",
      partitionKey: { name: "eventId", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "createdAt", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "ttl",
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // =========================================================
    // Lambda 関数
    // =========================================================
    const commonLambdaProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(10),
      bundling: {
        minify: true,
        sourceMap: false,
        externalModules: ["@aws-sdk/*"],
        forceDockerBundling: false,
      },
    };

    const createEventFn = new lambdaNodejs.NodejsFunction(
      this,
      "CreateEventFunction",
      {
        ...commonLambdaProps,
        functionName: "WaigayaSpace-CreateEvent",
        entry: path.join(__dirname, "../lambda/create-event/index.ts"),
        handler: "handler",
        environment: {
          EVENTS_TABLE: eventsTable.tableName,
        },
      }
    );
    eventsTable.grantReadWriteData(createEventFn);

    const createCommentFn = new lambdaNodejs.NodejsFunction(
      this,
      "CreateCommentFunction",
      {
        ...commonLambdaProps,
        functionName: "WaigayaSpace-CreateComment",
        entry: path.join(__dirname, "../lambda/create-comment/index.ts"),
        handler: "handler",
        environment: {
          EVENTS_TABLE: eventsTable.tableName,
          COMMENTS_TABLE: commentsTable.tableName,
        },
      }
    );
    eventsTable.grantReadData(createCommentFn);
    commentsTable.grantReadWriteData(createCommentFn);

    // =========================================================
    // AppSync GraphQL API
    // =========================================================
    const api = new appsync.GraphqlApi(this, "GraphqlApi", {
      name: "WaigayaSpaceAPI",
      definition: appsync.Definition.fromFile(
        path.join(__dirname, "../schema/schema.graphql")
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(cdk.Duration.days(365)),
          },
        },
      },
      xrayEnabled: true,
    });

    // --- データソース ---
    const eventsTableDs = api.addDynamoDbDataSource(
      "EventsTableDataSource",
      eventsTable
    );
    const commentsTableDs = api.addDynamoDbDataSource(
      "CommentsTableDataSource",
      commentsTable
    );
    const createEventDs = api.addLambdaDataSource(
      "CreateEventDataSource",
      createEventFn
    );
    const createCommentDs = api.addLambdaDataSource(
      "CreateCommentDataSource",
      createCommentFn
    );

    const reactToCommentFn = new lambdaNodejs.NodejsFunction(
      this,
      "ReactToCommentFunction",
      {
        ...commonLambdaProps,
        functionName: "WaigayaSpace-ReactToComment",
        entry: path.join(__dirname, "../lambda/react-to-comment/index.ts"),
        handler: "handler",
        environment: {
          COMMENTS_TABLE: commentsTable.tableName,
        },
      }
    );
    commentsTable.grantReadWriteData(reactToCommentFn);

    const reactToCommentDs = api.addLambdaDataSource(
      "ReactToCommentDataSource",
      reactToCommentFn
    );

    // --- リゾルバー: Query.getEvent ---
    eventsTableDs.createResolver("GetEventResolver", {
      typeName: "Query",
      fieldName: "getEvent",
      requestMappingTemplate: appsync.MappingTemplate.dynamoDbGetItem(
        "eventId",
        "eventId"
      ),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    // --- リゾルバー: Query.getEventByCode (Lambda経由) ---
    // participantCode -> GSI クエリ
    eventsTableDs.createResolver("GetEventByCodeResolver", {
      typeName: "Query",
      fieldName: "getEventByCode",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "index": "ParticipantCodeIndex",
  "query": {
    "expression": "participantCode = :code",
    "expressionValues": {
      ":code": $util.dynamodb.toDynamoDBJson($ctx.args.participantCode)
    }
  },
  "limit": 1
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
#if($ctx.result.items.size() > 0)
  $util.toJson($ctx.result.items[0])
#else
  null
#end
      `),
    });

    // --- リゾルバー: Query.listComments ---
    commentsTableDs.createResolver("ListCommentsResolver", {
      typeName: "Query",
      fieldName: "listComments",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "Query",
  "query": {
    "expression": "eventId = :eventId",
    "expressionValues": {
      ":eventId": $util.dynamodb.toDynamoDBJson($ctx.args.eventId)
    }
  },
  "scanIndexForward": true,
  #if($ctx.args.limit)
    "limit": $ctx.args.limit,
  #end
  #if($ctx.args.nextToken)
    "nextToken": "$ctx.args.nextToken"
  #end
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "items": $util.toJson($ctx.result.items),
  #if($ctx.result.nextToken)
    "nextToken": "$ctx.result.nextToken"
  #else
    "nextToken": null
  #end
}
      `),
    });

    // --- リゾルバー: Mutation.createEvent ---
    createEventDs.createResolver("CreateEventResolver", {
      typeName: "Mutation",
      fieldName: "createEvent",
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // --- リゾルバー: Mutation.postComment ---
    createCommentDs.createResolver("PostCommentResolver", {
      typeName: "Mutation",
      fieldName: "postComment",
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // --- リゾルバー: Mutation.reactToComment ---
    reactToCommentDs.createResolver("ReactToCommentResolver", {
      typeName: "Mutation",
      fieldName: "reactToComment",
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // --- リゾルバー: Mutation.closeEvent ---
    eventsTableDs.createResolver("CloseEventResolver", {
      typeName: "Mutation",
      fieldName: "closeEvent",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "eventId": $util.dynamodb.toDynamoDBJson($ctx.args.eventId)
  },
  "update": {
    "expression": "SET isActive = :false",
    "expressionValues": {
      ":false": { "BOOL": false }
    }
  },
  "condition": {
    "expression": "attribute_exists(eventId)"
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    // --- リゾルバー: Mutation.setEventTags ---
    eventsTableDs.createResolver("SetEventTagsResolver", {
      typeName: "Mutation",
      fieldName: "setEventTags",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "eventId": $util.dynamodb.toDynamoDBJson($ctx.args.eventId)
  },
  "update": {
    "expression": "SET tags = :tags",
    "expressionValues": {
      ":tags": $util.dynamodb.toDynamoDBJson($ctx.args.tags)
    }
  },
  "condition": {
    "expression": "attribute_exists(eventId)"
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    // --- リゾルバー: Mutation.broadcastTag ---
    eventsTableDs.createResolver("BroadcastTagResolver", {
      typeName: "Mutation",
      fieldName: "broadcastTag",
      requestMappingTemplate: appsync.MappingTemplate.fromString(`
{
  "version": "2017-02-28",
  "operation": "UpdateItem",
  "key": {
    "eventId": $util.dynamodb.toDynamoDBJson($ctx.args.eventId)
  },
  "update": {
    "expression": "SET currentTag = :tag",
    "expressionValues": {
      ":tag": $util.dynamodb.toDynamoDBJson($ctx.args.tag)
    }
  },
  "condition": {
    "expression": "attribute_exists(eventId)"
  }
}
      `),
      responseMappingTemplate: appsync.MappingTemplate.dynamoDbResultItem(),
    });

    // =========================================================
    // S3 バケット (フロントエンド静的ホスティング)
    // =========================================================
    const frontendBucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // =========================================================
    // CloudFront + OAC
    // =========================================================
    const oac = new cloudfront.S3OriginAccessControl(this, "FrontendOAC", {
      description: "OAC for waigaya.space Frontend",
    });

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "Certificate",
      certificateArn
    );

    const distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      {
        defaultBehavior: {
          origin: origins.S3BucketOrigin.withOriginAccessControl(
            frontendBucket,
            { originAccessControl: oac }
          ),
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        },
        domainNames: ["waigaya.space", "www.waigaya.space"],
        certificate,
        defaultRootObject: "index.html",
        errorResponses: [
          {
            httpStatus: 403,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
          {
            httpStatus: 404,
            responseHttpStatus: 200,
            responsePagePath: "/index.html",
          },
        ],
        priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      }
    );

    // S3 バケットポリシー: CloudFront OAC のみ許可
    frontendBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
        actions: ["s3:GetObject"],
        resources: [frontendBucket.arnForObjects("*")],
        conditions: {
          StringEquals: {
            "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/${distribution.distributionId}`,
          },
        },
      })
    );

    // =========================================================
    // Route53 Aレコード → CloudFront
    // =========================================================
    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: "waigaya.space",
    });

    new route53.ARecord(this, "AliasRecord", {
      zone: hostedZone,
      recordName: "waigaya.space",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    });

    new route53.ARecord(this, "WwwAliasRecord", {
      zone: hostedZone,
      recordName: "www.waigaya.space",
      target: route53.RecordTarget.fromAlias(
        new route53Targets.CloudFrontTarget(distribution)
      ),
    });

    // =========================================================
    // CDK Outputs
    // =========================================================
    new cdk.CfnOutput(this, "AppSyncApiUrl", {
      value: api.graphqlUrl,
      description: "AppSync GraphQL API URL",
    });
    new cdk.CfnOutput(this, "AppSyncApiKey", {
      value: api.apiKey ?? "",
      description: "AppSync API Key",
    });
    new cdk.CfnOutput(this, "CloudFrontUrl", {
      value: `https://${distribution.distributionDomainName}`,
      description: "CloudFront Distribution URL",
    });
    new cdk.CfnOutput(this, "FrontendBucketName", {
      value: frontendBucket.bucketName,
      description: "S3 Bucket name for frontend deployment",
    });
    new cdk.CfnOutput(this, "CloudFrontDistributionId", {
      value: distribution.distributionId,
      description: "CloudFront Distribution ID (for cache invalidation)",
    });
  }
}
