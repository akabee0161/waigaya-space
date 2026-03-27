import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE!;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE!;

export const handler = async (event: {
  arguments: {
    input: { eventId: string; content: string; authorName: string };
  };
}) => {
  const { eventId, content, authorName } = event.arguments.input;

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
  const createdAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 72 * 60 * 60;

  const item = {
    eventId,
    createdAt,
    commentId,
    content,
    authorName,
    ttl,
  };

  await docClient.send(
    new PutCommand({
      TableName: COMMENTS_TABLE,
      Item: item,
    })
  );

  return item;
};
