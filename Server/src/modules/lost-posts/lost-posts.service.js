import * as repository from "./lost-posts.repository.js"

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
  // 등록 API는 최소 1장, 최대 8장의 사진을 요구한다.
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw serviceError("이미지를 1장 이상 등록해주세요.", 400, "MISSING_IMAGES")
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
  validateChoice(sex, ["M", "F", "U"], "sex")
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
  const color = optionalText(query.color)
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
    filters: { species, breed, color, region, startDate, endDate, status },
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

// TODO: 아래 함수들은 해당 API 담당 범위에서 구현한다.
// - updatePost: 3.4 실종 공고 수정
// - updateStatus: 3.4 상태 변경 (찾음 처리)
// - deletePost: 3.4 실종 공고 삭제
