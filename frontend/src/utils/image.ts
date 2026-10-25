export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// 画像は CloudFront の /images/* で配信される。ローカル開発時は本番ドメインを参照する
const IMAGE_BASE = import.meta.env.DEV ? "https://waigaya.space" : "";

export const imageUrl = (imageKey: string) => `${IMAGE_BASE}/${imageKey}`;

// 添付可能な画像か検証し、不可ならエラーメッセージを返す
export function validateImage(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return "添付できる画像は JPEG / PNG / GIF / WebP のみです";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "画像のサイズは 5MB 以下にしてください";
  }
  return null;
}
