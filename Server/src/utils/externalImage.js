import { uploadToR2 } from "./r2.js"

const IMAGE_DOWNLOAD_TIMEOUT_MS = 15_000
const MAX_IMAGE_BYTES = 15 * 1024 * 1024

function detectImageContentType(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png"
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp"
  }
  if (buffer.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.subarray(0, 6).toString("ascii"))) {
    return "image/gif"
  }
  return null
}

export async function downloadAndUploadExternalImage(sourceUrl, folder) {
  const response = await fetch(sourceUrl, {
    headers: {
      Accept: "image/*",
      "User-Agent": "ForMate-ImageSync/0.1",
    },
    signal: AbortSignal.timeout(IMAGE_DOWNLOAD_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`이미지 다운로드 실패 (${response.status}): ${sourceUrl}`)
  }

  const responseContentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase()

  const declaredSize = Number(response.headers.get("content-length") ?? 0)
  if (declaredSize > MAX_IMAGE_BYTES) {
    throw new Error(`이미지 용량이 너무 큽니다: ${sourceUrl}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`이미지 용량이 올바르지 않습니다: ${sourceUrl}`)
  }

  const detectedContentType = detectImageContentType(buffer)
  const contentType = responseContentType.startsWith("image/")
    ? responseContentType
    : detectedContentType
  if (!contentType) {
    throw new Error(
      `이미지 파일로 확인할 수 없습니다 (${responseContentType || "unknown"}): ${sourceUrl}`,
    )
  }

  return uploadToR2(buffer, folder, contentType)
}
