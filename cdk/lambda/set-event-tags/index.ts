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

  // 強整合読み取りで現在の currentTag を取得し、新タグ一覧に含まれなければクリアする
  const current = await docClient.send(
    new GetCommand({ TableName: EVENTS_TABLE, Key: { eventId }, ConsistentRead: true })
  );

  if (!current.Item) {
    throw new Error(`Event not found: ${eventId}`);
  }

  const existingCurrentTag: string | null = current.Item.currentTag ?? null;
  const newCurrentTag =
    existingCurrentTag != null && normalizedTags.includes(existingCurrentTag)
      ? existingCurrentTag
      : null;

  // 読み取り時点の currentTag が変更されていない場合のみ更新する（楽観的ロック）
  // currentTag が文字列の場合: 値が一致することを条件にする
  // currentTag が null/未設定の場合: null → null/string は常に安全なため条件を省略
  const conditionExpression =
    existingCurrentTag != null
      ? "attribute_exists(eventId) AND currentTag = :existingCurrentTag"
      : "attribute_exists(eventId)";

  const expressionAttributeValues: Record<string, unknown> = {
    ":tags": normalizedTags,
    ":currentTag": newCurrentTag,
  };
  if (existingCurrentTag != null) {
    expressionAttributeValues[":existingCurrentTag"] = existingCurrentTag;
  }

  const result = await docClient.send(
    new UpdateCommand({
      TableName: EVENTS_TABLE,
      Key: { eventId },
      UpdateExpression: "SET tags = :tags, currentTag = :currentTag",
      ConditionExpression: conditionExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};
