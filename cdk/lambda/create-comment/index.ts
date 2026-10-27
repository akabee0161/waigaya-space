import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE!;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE!;

const MAX_PUT_ATTEMPTS = 10;

const IMAGE_KEY_PATTERN = /^images\/[0-9a-f-]{36}\.(jpg|png|gif|webp)$/;

export const handler = async (event: {
  arguments: {
    input: {
      eventId: string;
      content: string;
      authorName: string;
      imageKey?: string | null;
    };
  };
}) => {
  const { eventId, content, authorName, imageKey } = event.arguments.input;

  // get-upload-url が発行した形式のキーのみ受け付ける
  if (imageKey && !IMAGE_KEY_PATTERN.test(imageKey)) {
    throw new Error("Invalid imageKey");
  }

  // イベントの存在・アクティブ状態を確認
  const eventResult = await docClient.send(
    new GetCommand({
      TableName: EVENTS_TABLE,
      Key: { eventId },
    })
  );

  if (!eventResult.Item) {
    throw new Error(`Event not found: ${eventId}`);
  }
  if (!eventResult.Item.isActive) {
    throw new Error(`Event is closed: ${eventId}`);
  }

  const commentId = randomUUID();
  const ttl = Math.floor(Date.now() / 1000) + 72 * 60 * 60;
  let time = Date.now();

  // createdAt はソートキーのため、同じミリ秒の投稿が既にあれば上書きせず 1ms ずらして保存し直す
  for (let attempt = 0; attempt < MAX_PUT_ATTEMPTS; attempt++, time++) {
    const item = {
      eventId,
      createdAt: new Date(time).toISOString(),
      commentId,
      content,
      authorName,
      ...(imageKey ? { imageKey } : {}),
      ttl,
    };
    try {
      await docClient.send(
        new PutCommand({
          TableName: COMMENTS_TABLE,
          Item: item,
          ConditionExpression: "attribute_not_exists(createdAt)",
        })
      );
      return item;
    } catch (err) {
      if (!(err instanceof ConditionalCheckFailedException)) throw err;
    }
  }
  throw new Error("Failed to save comment: createdAt collided repeatedly");
};
