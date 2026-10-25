import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";

const s3 = new S3Client({});

const IMAGES_BUCKET = process.env.IMAGES_BUCKET!;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
};

export const handler = async (event: {
  arguments: { contentType: string };
}) => {
  const { contentType } = event.arguments;
  const ext = EXTENSIONS[contentType];
  if (!ext) {
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const imageKey = `images/${randomUUID()}.${ext}`;
  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: IMAGES_BUCKET,
      Key: imageKey,
      ContentType: contentType,
    }),
    { expiresIn: 300 }
  );

  return { uploadUrl, imageKey };
};
