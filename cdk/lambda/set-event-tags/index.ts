import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE!;

function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

export const handler = async (event: {
  arguments: { eventId: string; tags: string[] };
}) => {
  const { eventId, tags } = event.arguments;
  const normalizedTags = normalizeTags(tags);

  // 現在の currentTag を取得し、新タグ一覧に含まれなければクリアする
  const current = await docClient.send(
    new GetCommand({ TableName: EVENTS_TABLE, Key: { eventId } })
  );

  if (!current.Item) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const existingCurrentTag: string | null = current.Item.currentTag ?? null;
  const newCurrentTag =
    existingCurrentTag != null && normalizedTags.includes(existingCurrentTag)
      ? existingCurrentTag
      : null;

  const result = await docClient.send(
    new UpdateCommand({
      TableName: EVENTS_TABLE,
      Key: { eventId },
      UpdateExpression: "SET tags = :tags, currentTag = :currentTag",
      ExpressionAttributeValues: {
        ":tags": normalizedTags,
        ":currentTag": newCurrentTag,
      },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};
