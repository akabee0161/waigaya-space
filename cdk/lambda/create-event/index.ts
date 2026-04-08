import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "crypto";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const EVENTS_TABLE = process.env.EVENTS_TABLE!;

function normalizeTags(tags?: string[]): string[] {
  if (!tags) return [];
  return [...new Set(tags.map((t) => t.trim()).filter((t) => t.length > 0))];
}

function generateParticipantCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const handler = async (event: {
  arguments: { input: { title: string; description?: string; tags?: string[] } };
}) => {
  const { title, description, tags } = event.arguments.input;

  const eventId = randomUUID();
  const participantCode = generateParticipantCode();
  const createdAt = new Date().toISOString();

  const ttl = Math.floor(Date.now() / 1000) + 72 * 60 * 60;

  const item = {
    eventId,
    title,
    description: description ?? null,
    participantCode,
    createdAt,
    isActive: true,
    tags: normalizeTags(tags),
    currentTag: null,
    ttl,
  };

  await docClient.send(
    new PutCommand({
      TableName: EVENTS_TABLE,
      Item: item,
    })
  );

  return item;
};
