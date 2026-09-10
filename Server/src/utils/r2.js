import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import crypto from "node:crypto"

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
})

const BUCKET = process.env.R2_BUCKET_NAME
const PUBLIC_URL = process.env.R2_PUBLIC_URL // 끝에 슬래시(/) 없이, 예: https://pub-xxxx.r2.dev

export async function uploadToR2(buffer, folder, contentType = "image/jpeg") {
  const key = `${folder}/${crypto.randomUUID()}.jpg`

  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  )

  return { key, url: `${PUBLIC_URL}/${key}` }
}

export async function deleteFromR2(key) {
  if (!key) return
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// DB에 저장된 공개 URL에서 R2 key만 뽑아낸다 (삭제할 때 필요).
export function extractR2Key(url) {
  if (!url || !url.startsWith(PUBLIC_URL)) return null
  return url.slice(PUBLIC_URL.length + 1)
}