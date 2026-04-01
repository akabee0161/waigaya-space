import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const COMMENTS_TABLE = process.env.COMMENTS_TABLE!;
const VALID_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"];

export const handler = async (event: {
  arguments: { eventId: string; commentCreatedAt: string; emoji: string };
}) => {
  const { eventId, commentCreatedAt, emoji } = event.arguments;

  if (!VALID_EMOJIS.includes(emoji)) {
    throw new Error(`Invalid emoji: ${emoji}`);
  }

  // reactions マップが存在しない場合に備えて初期化
  await docClient.send(
    new UpdateCommand({
      TableName: COMMENTS_TABLE,
      Key: { eventId, createdAt: commentCreatedAt },
      UpdateExpression: "SET reactions = if_not_exists(reactions, :emptyMap)",
      ExpressionAttributeValues: { ":emptyMap": {} },
    })
  );

  // 該当絵文字のカウントをアトミックにインクリメント
  const result = await docClient.send(
    new UpdateCommand({
      TableName: COMMENTS_TABLE,
      Key: { eventId, createdAt: commentCreatedAt },
      UpdateExpression:
        "SET reactions.#emoji = if_not_exists(reactions.#emoji, :zero) + :one",
      ExpressionAttributeNames: { "#emoji": emoji },
      ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
      ReturnValues: "ALL_NEW",
    })
  );

  return result.Attributes;
};
