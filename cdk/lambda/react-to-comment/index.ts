import { DynamoDBClient, ConditionalCheckFailedException } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const COMMENTS_TABLE = process.env.COMMENTS_TABLE!;
const VALID_EMOJIS = ["👍", "❤️", "😂", "😮", "👏"];

export const handler = async (event: {
  arguments: { eventId: string; commentCreatedAt: string; emoji: string; action: string };
}) => {
  const { eventId, commentCreatedAt, emoji, action } = event.arguments;

  if (!VALID_EMOJIS.includes(emoji)) {
    throw new Error(`Invalid emoji: ${emoji}`);
  }
  if (action !== "add" && action !== "remove") {
    throw new Error(`Invalid action: ${action}`);
  }

  if (action === "add") {
    // reactions マップが存在しない場合に備えて初期化
    await docClient.send(
      new UpdateCommand({
        TableName: COMMENTS_TABLE,
        Key: { eventId, createdAt: commentCreatedAt },
        UpdateExpression: "SET reactions = if_not_exists(reactions, :emptyMap)",
        ExpressionAttributeValues: { ":emptyMap": {} },
      })
    );

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
  } else {
    // デクリメント（0より大きい場合のみ）
    try {
      const result = await docClient.send(
        new UpdateCommand({
          TableName: COMMENTS_TABLE,
          Key: { eventId, createdAt: commentCreatedAt },
          UpdateExpression: "SET reactions.#emoji = reactions.#emoji - :one",
          ConditionExpression: "reactions.#emoji > :zero",
          ExpressionAttributeNames: { "#emoji": emoji },
          ExpressionAttributeValues: { ":one": 1, ":zero": 0 },
          ReturnValues: "ALL_NEW",
        })
      );
      return result.Attributes;
    } catch (err) {
      if (err instanceof ConditionalCheckFailedException) {
        // すでに0の場合は何もしない（現在の状態をそのまま返す）
        const current = await docClient.send(
          new GetCommand({
            TableName: COMMENTS_TABLE,
            Key: { eventId, createdAt: commentCreatedAt },
          })
        );
        return current.Item;
      }
      throw err;
    }
  }
};
