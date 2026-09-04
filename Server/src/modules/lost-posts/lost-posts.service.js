import * as repository from "./lost-posts.repository.js"
import { unlink } from "node:fs/promises"
import path from "node:path"

// 공통 error.middleware가 HTTP 상태와 오류 코드를 응답에 사용할 수 있도록
// 일반 Error 객체에 status와 code를 추가해서 만든다.
function serviceError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

// 필수 문자열을 검사하고 앞뒤 공백을 제거한다.
// 값이 없거나 문자열이 아니면 DB 작업 전에 400 오류를 발생시킨다.
function requiredText(value, fieldName) {
  const text = typeof value === "string" ? value.trim() : ""
  if (!text) {
    throw serviceError(`${fieldName}은(는) 필수입니다.`, 400, "MISSING_FIELD")
  }
  return text
}

// 선택 입력값은 공백을 제거한 뒤 반환하고, 비어 있으면 DB의 NULL로 저장한다.
function optionalText(value) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  return text || null
}

// 목록의 다중 색상 필터를 문자열 배열로 정리한다.
// colors=갈색,검은색 형식과 colors=갈색&colors=검은색 형식을 모두 허용한다.
// 기존 클라이언트의 color=갈색 요청도 호환성을 위해 함께 지원한다.
function parseColorFilters(colorsValue, legacyColorValue) {
  const values = colorsValue ?? legacyColorValue
  if (values === undefined || values === null || values === "") return []

  const entries = Array.isArray(values) ? values : [values]
  return [
    ...new Set(
      entries
        .flatMap((value) => String(value).split(","))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ]
}

// DB의 VARCHAR 길이를 넘긴 요청이 DB 오류(500)로 처리되지 않도록 사전에 검사한다.
function assertMaxLength(value, maxLength, fieldName) {
  if (value && value.length > maxLength) {
    throw serviceError(
      `${fieldName}은(는) ${maxLength}자 이하로 입력해주세요.`,
      400,
      "INVALID_FIELD",
    )
  }
}

// 성별이나 중성화 여부처럼 정해진 값만 허용하는 필드를 검사한다.
// 선택 필드는 null일 수 있으므로 값이 들어왔을 때만 검사한다.
function validateChoice(value, allowed, fieldName) {
  if (value && !allowed.includes(value)) {
    throw serviceError(`${fieldName} 값이 올바르지 않습니다.`, 400, "INVALID_FIELD")
  }
}

// multipart/form-data로 전달된 날짜 문자열이 YYYY-MM-DD 형식인지 확인하고,
// 2월 30일처럼 실제 달력에 없는 날짜도 함께 거부한다.
function validateDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw serviceError("event_date는 YYYY-MM-DD 형식이어야 합니다.", 400, "INVALID_DATE")
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw serviceError("event_date가 올바른 날짜가 아닙니다.", 400, "INVALID_DATE")
  }
}

// 3.1 실종 공고 등록 (사진 최대 8장)
export async function createPost({ userId, body, imageUrls }) {
  // upload 미들웨어가 만든 URL 배열을 확인한다.
  // 등록 API는 최소 3장, 최대 8장의 사진을 요구한다.
  if (!Array.isArray(imageUrls) || imageUrls.length < 3) {
    throw serviceError("이미지를 3장 이상 등록해주세요.", 400, "MISSING_IMAGES")
  }
  if (imageUrls.length > 8) {
    throw serviceError("이미지는 최대 8장까지 등록할 수 있습니다.", 400, "TOO_MANY_IMAGES")
  }

  // API 명세보다 현재 DB 스키마를 우선하여 pet_name도 필수로 검사한다.
  // requiredText와 optionalText는 검증과 동시에 앞뒤 공백을 제거한다.
  const petName = requiredText(body.pet_name, "pet_name")
  const species = requiredText(body.species, "species")
  const region = requiredText(body.region, "region")
  const eventDate = requiredText(body.event_date, "event_date")
  const breed = optionalText(body.breed)
  const color = optionalText(body.color)
  const sex = optionalText(body.sex)?.toUpperCase() ?? null
  const neuterYn = optionalText(body.neuter_yn)?.toUpperCase() ?? null
  const description = optionalText(body.description)

  // DB에 저장하기 전에 명세에서 정한 코드값과 날짜 형식을 검사한다.
  // sex와 neuter_yn은 사용자가 소문자로 보내도 대문자로 바꾼 뒤 검사한다.
  validateChoice(species, ["개", "고양이"], "species")
  validateChoice(sex, ["M", "F", "Q"], "sex")
  validateChoice(neuterYn, ["Y", "N", "U"], "neuter_yn")
  validateDate(eventDate)

  // 각 길이는 schema.sql의 VARCHAR 크기와 동일하게 제한한다.
  assertMaxLength(petName, 50, "pet_name")
  assertMaxLength(species, 20, "species")
  assertMaxLength(breed, 50, "breed")
  assertMaxLength(color, 30, "color")
  assertMaxLength(region, 100, "region")

  // 모든 입력 검사가 끝난 뒤에만 repository를 호출한다.
  // repository는 공고와 이미지 저장을 하나의 DB 트랜잭션으로 처리한다.
  const createdPost = await repository.createPostWithImages({
    userId,
    post: { petName, species, breed, color, sex, neuterYn, region, eventDate, description },
    imageUrls,
  })

  // TODO(AI 연동): AI API가 정해지면 여기에서 createdPost.id와 images를 전달한다.
  // 등록 응답을 지연시키지 않도록 await 없이 비동기로 요청하고, 실패 로그/재시도 정책도 함께 정한다.

  // DB가 생성한 id, status, created_at과 저장된 이미지 목록을 컨트롤러에 반환한다.
  return createdPost
}

// 목록 조회의 page와 size는 양의 정수만 허용하고 과도한 조회를 막기 위해 최대 100개로 제한한다.
function parsePagingValue(value, defaultValue, fieldName, maxValue) {
  if (value === undefined || value === "") return defaultValue

  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0 || number > maxValue) {
    throw serviceError(
      `${fieldName} 값이 올바르지 않습니다.`,
      400,
      "INVALID_PAGINATION",
    )
  }
  return number
}

// 날짜 필터가 들어온 경우에만 YYYY-MM-DD 형식과 실제 날짜인지 검사한다.
function validateFilterDate(value, fieldName) {
  if (!value) return
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw serviceError(`${fieldName} 형식이 올바르지 않습니다.`, 400, "INVALID_DATE")
  }

  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw serviceError(`${fieldName}가 올바른 날짜가 아닙니다.`, 400, "INVALID_DATE")
  }
}

// 3.2 실종 공고 목록 조회 (필터링 + 페이지네이션)
export async function getPosts(query) {
  const page = parsePagingValue(query.page, 1, "page", Number.MAX_SAFE_INTEGER)
  const size = parsePagingValue(query.size, 20, "size", 100)

  const species = optionalText(query.species)
  const breed = optionalText(query.breed)
  const colors = parseColorFilters(query.colors, query.color)
  const region = optionalText(query.region)
  const startDate = optionalText(query.start_date)
  const endDate = optionalText(query.end_date)
  const status = optionalText(query.status) ?? "active"

  validateChoice(species, ["개", "고양이"], "species")
  validateChoice(status, ["active", "closed"], "status")
  validateFilterDate(startDate, "start_date")
  validateFilterDate(endDate, "end_date")

  if (startDate && endDate && startDate > endDate) {
    throw serviceError(
      "start_date는 end_date보다 늦을 수 없습니다.",
      400,
      "INVALID_DATE_RANGE",
    )
  }

  const { items, total } = await repository.findMany({
    filters: { species, breed, colors, region, startDate, endDate, status },
    size,
    offset: (page - 1) * size,
  })

  return {
    items,
    pagination: {
      page,
      size,
      total,
      total_pages: Math.ceil(total / size),
    },
  }
}

// 3.3 실종 공고 상세 조회
export async function getPost({ postId, userId }) {
  // URL 파라미터는 문자열로 들어오므로 양의 정수 ID인지 먼저 검사한다.
  const id = Number(postId)
  if (!Number.isInteger(id) || id <= 0) {
    throw serviceError("공고 ID가 올바르지 않습니다.", 400, "INVALID_POST_ID")
  }

  const post = await repository.findById(id)
  if (!post) {
    throw serviceError("실종 공고를 찾을 수 없습니다.", 404, "LOST_POST_NOT_FOUND")
  }

  // 작성자 ID는 내부 비교에만 사용하고 API 응답에는 노출하지 않는다.
  const { user_id: ownerId, ...publicPost } = post

  return {
    ...publicPost,
    // 현재 상세 라우트는 공개 조회이므로 userId가 없으면 false이다.
    // 추후 선택적 인증이 연결되면 로그인 사용자의 소유 여부를 자동으로 계산한다.
    is_owner: userId != null && String(userId) === String(ownerId),
  }
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

// multipart/form-data의 delete_image_ids는 JSON 문자열로 들어온다.
// 중복을 제거하고 PostgreSQL BIGINT에 안전하게 전달할 양의 정수 문자열로 정리한다.
function parseDeleteImageIds(value) {
  if (value === undefined || value === null || value === "") return []

  let parsed = value
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value)
    } catch {
      throw serviceError(
        "delete_image_ids는 JSON 배열 형식이어야 합니다.",
        400,
        "INVALID_IMAGE_IDS",
      )
    }
  }

  if (!Array.isArray(parsed)) {
    throw serviceError(
      "delete_image_ids는 JSON 배열 형식이어야 합니다.",
      400,
      "INVALID_IMAGE_IDS",
    )
  }

  const ids = parsed.map((id) => String(id))
  if (ids.some((id) => !/^[1-9]\d*$/.test(id))) {
    throw serviceError(
      "삭제할 이미지 ID가 올바르지 않습니다.",
      400,
      "INVALID_IMAGE_IDS",
    )
  }
  return [...new Set(ids)]
}

// DB에서 삭제된 이미지 중 로컬 업로드 경로만 실제 디스크에서도 제거한다.
// 과거 Supabase URL은 로컬 파일이 아니므로 이 함수에서 건드리지 않는다.
async function removeOldLocalImages(images) {
  const localPrefix = "/uploads/lost-posts/"
  for (const image of images) {
    if (!image.image_url?.startsWith(localPrefix)) continue

    const filename = path.basename(image.image_url)
    const filePath = path.resolve("uploads", "lost-posts", filename)
    try {
      await unlink(filePath)
    } catch (error) {
      // DB 수정은 이미 완료됐으므로 파일 정리 실패는 기록만 남긴다.
      if (error.code !== "ENOENT") console.error("기존 실종 이미지 삭제 실패:", error)
    }
  }
}

// 3.4 실종 공고 및 이미지 수정
export async function updatePost({ postId, userId, body, imageUrls = [] }) {
  const id = Number(postId)
  if (!Number.isInteger(id) || id <= 0) {
    throw serviceError("공고 ID가 올바르지 않습니다.", 400, "INVALID_POST_ID")
  }

  const updates = {}

  // 요청에 포함된 필드만 검증하고 수정한다. 선택 필드는 빈 문자열로 보내면 NULL이 된다.
  if (hasOwn(body, "pet_name")) updates.pet_name = requiredText(body.pet_name, "pet_name")
  if (hasOwn(body, "species")) updates.species = requiredText(body.species, "species")
  if (hasOwn(body, "breed")) updates.breed = optionalText(body.breed)
  if (hasOwn(body, "color")) updates.color = optionalText(body.color)
  if (hasOwn(body, "sex")) updates.sex = optionalText(body.sex)?.toUpperCase() ?? null
  if (hasOwn(body, "neuter_yn")) {
    updates.neuter_yn = optionalText(body.neuter_yn)?.toUpperCase() ?? null
  }
  if (hasOwn(body, "region")) updates.region = requiredText(body.region, "region")
  if (hasOwn(body, "event_date")) {
    updates.event_date = requiredText(body.event_date, "event_date")
  }
  if (hasOwn(body, "description")) updates.description = optionalText(body.description)

  if (updates.species !== undefined) validateChoice(updates.species, ["개", "고양이"], "species")
  if (updates.sex !== undefined) validateChoice(updates.sex, ["M", "F", "U"], "sex")
  if (updates.neuter_yn !== undefined) {
    validateChoice(updates.neuter_yn, ["Y", "N", "U"], "neuter_yn")
  }
  if (updates.event_date !== undefined) validateDate(updates.event_date)

  assertMaxLength(updates.pet_name, 50, "pet_name")
  assertMaxLength(updates.species, 20, "species")
  assertMaxLength(updates.breed, 50, "breed")
  assertMaxLength(updates.color, 30, "color")
  assertMaxLength(updates.region, 100, "region")

  const deleteImageIds = parseDeleteImageIds(body.delete_image_ids)
  if (Object.keys(updates).length === 0 && deleteImageIds.length === 0 && imageUrls.length === 0) {
    throw serviceError("수정할 내용을 입력해주세요.", 400, "NO_CHANGES")
  }

  const result = await repository.updatePostWithImages({
    id,
    userId,
    updates,
    deleteImageIds,
    imageUrls,
  })

  if (result.outcome === "not_found") {
    throw serviceError("실종 공고를 찾을 수 없습니다.", 404, "LOST_POST_NOT_FOUND")
  }
  if (result.outcome === "forbidden") {
    throw serviceError("공고 작성자만 수정할 수 있습니다.", 403, "FORBIDDEN")
  }
  if (result.outcome === "invalid_image_ids") {
    throw serviceError(
      "현재 공고에 속하지 않은 이미지 ID가 포함되어 있습니다.",
      400,
      "INVALID_IMAGE_IDS",
    )
  }
  if (result.outcome === "invalid_image_count") {
    throw serviceError(
      "수정 완료 후 이미지는 1장 이상 8장 이하여야 합니다.",
      400,
      "INVALID_IMAGE_COUNT",
    )
  }

  // DB 트랜잭션이 성공한 후에만 삭제 대상 기존 로컬 파일을 제거한다.
  await removeOldLocalImages(result.deletedImages)

  const { user_id, ...publicPost } = result.post
  return publicPost
}

// 3.4 실종 공고 삭제
export async function deletePost({ postId, userId }) {
  const id = Number(postId)
  if (!Number.isInteger(id) || id <= 0) {
    throw serviceError("공고 ID가 올바르지 않습니다.", 400, "INVALID_POST_ID")
  }

  const result = await repository.deletePost({ id, userId })

  if (result.outcome === "not_found") {
    throw serviceError("실종 공고를 찾을 수 없습니다.", 404, "LOST_POST_NOT_FOUND")
  }
  if (result.outcome === "forbidden") {
    throw serviceError("공고 작성자만 삭제할 수 있습니다.", 403, "FORBIDDEN")
  }

  // DB 트랜잭션이 성공한 뒤에만 연결됐던 로컬 이미지 파일을 삭제한다.
  // Supabase URL이나 이미 사라진 파일은 removeOldLocalImages에서 안전하게 건너뛴다.
  await removeOldLocalImages(result.images)
}

// TODO: updateStatus(3.4 상태 변경)는 해당 API 구현 시 추가한다.
