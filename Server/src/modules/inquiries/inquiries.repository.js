import { query } from "../../db/pool.js"

// 사용 테이블: inquiries

// RETURNING / SELECT에서 공통으로 쓰는 컬럼 목록. auth.repository.js의 USER_COLUMNS와 같은 패턴.
const INQUIRY_COLUMNS = `id, user_id, type, title, content, status, answer, answered_at, created_at`

// 문의 1건 INSERT. status/created_at은 넘기지 않고 스키마 DEFAULT('pending', NOW())에 맡긴다.
// $1~$4 파라미터 바인딩으로 값을 전달해 SQL 인젝션을 방지한다.
// RETURNING으로 방금 저장된 row(자동 생성된 id/status/created_at 포함)를 그대로 돌려받는다.
export async function create({ userId, type, title, content }) {
  const result = await query(
    `INSERT INTO inquiries (user_id, type, title, content)
     VALUES ($1, $2, $3, $4)
     RETURNING ${INQUIRY_COLUMNS}`,
    [userId, type, title, content],
  )
  return result.rows[0] // INSERT는 항상 1건이므로 [0]만 반환
}

// 로그인한 사용자가 등록한 문의 "목록"을 조회한다. (11.2 내 문의 목록 조회)
// - WHERE user_id = $1  : 다른 사람 문의는 섞이지 않도록 "내 문의"만 걸러낸다.
// - ORDER BY created_at DESC : 최근에 등록한 문의가 맨 위로 오도록 최신순 정렬.
// create()와 달리 여러 행이 나올 수 있으므로 result.rows 전체(배열)를 그대로 반환한다.
export async function findManyByUserId(userId) {
  const result = await query(
    `SELECT ${INQUIRY_COLUMNS}
     FROM inquiries
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId],
  )
  return result.rows
}

// 문의 1건을 id로 조회한다. (11.2 문의 상세 조회)
// - WHERE id = $1 : 문의 게시판 전체에서 그 번호(PK) 하나만 콕 집어서 가져온다.
// - findManyByUserId()와 달리 1건만 필요하므로 결과 배열의 [0]만 꺼내서 반환한다.
// - 해당 id의 문의가 없으면 result.rows[0]은 undefined다.
//   undefined를 그대로 두면 호출부에서 다루기 애매하므로 null로 통일해서 반환한다.
//   (서비스 쪽에서 "if (!inquiry)" 한 줄로 존재 여부를 검사할 수 있게 하기 위함)
export async function findById(inquiryId) {
  const result = await query(
    `SELECT ${INQUIRY_COLUMNS}
     FROM inquiries
     WHERE id = $1`,
    [inquiryId],
  )
  return result.rows[0] ?? null
}
