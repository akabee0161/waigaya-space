import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE!;
const COMMENTS_TABLE = process.env.COMMENTS_TABLE!;

interface CommentItem {
  eventId: string;
  createdAt: string;
  commentId: string;
  content: string;
  authorName: string;
  ttl: number;
  tag?: string;
}

export const handler = async (event: {
  arguments: {
    input: { eventId: string; content: string; authorName: string; tag?: string };
  };
}) => {
  const { eventId, content, authorName, tag } = event.arguments.input;

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

  // タグのバリデーション
  let normalizedTag: string | undefined;
  if (tag != null) {
    normalizedTag = tag.trim();
    if (!normalizedTag) {
      throw new Error("Tag must not be empty");
    }
    const eventTags = Array.isArray(eventResult.Item.tags)
      ? eventResult.Item.tags.filter((t): t is string => typeof t === "string")
      : [];
    if (!eventTags.includes(normalizedTag)) {
      throw new Error(`Invalid tag for event: ${normalizedTag}`);
    }
  }

  const commentId = randomUUID();
  const createdAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 72 * 60 * 60;

  const item: CommentItem = {
    eventId,
    createdAt,
    commentId,
    content,
    authorName,
    ttl,
    ...(normalizedTag != null && { tag: normalizedTag }),
  };

  await docClient.send(
    new PutCommand({
      TableName: COMMENTS_TABLE,
      Item: item,
    })
  );

  return item;
};
