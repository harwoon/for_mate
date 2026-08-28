import { pool } from "../../db/pool.js"

// 사용 테이블: lost_posts, images

// 공고 등록 후 API 응답으로 돌려줄 컬럼 목록이다.
// user_id와 description처럼 현재 등록 응답 명세에 없는 값은 제외한다.
const LOST_POST_COLUMNS = `
  id, pet_name, species, breed, color, sex, neuter_yn,
  region, event_date, status, created_at
`

// 3.1 실종 공고와 사진을 하나의 트랜잭션으로 저장한다.
// 사진 저장 중 오류가 발생하면 공고 저장도 함께 취소된다.
export async function createPostWithImages({ userId, post, imageUrls }) {
  // 같은 DB 연결에서 BEGIN, INSERT, COMMIT/ROLLBACK을 실행해야 하므로
  // 공용 query 함수 대신 pool에서 전용 client를 빌린다.
  const client = await pool.connect()

  try {
    // 여기부터 COMMIT 전까지의 쿼리를 하나의 작업 단위로 묶는다.
    await client.query("BEGIN")

    // 인증 미들웨어가 확인한 userId와 서비스에서 검증·정리한 입력값으로
    // lost_posts 레코드를 먼저 만든다. status와 created_at은 DB 기본값을 사용한다.
    const postResult = await client.query(
      `INSERT INTO lost_posts (
         user_id, pet_name, species, breed, color, sex,
         neuter_yn, region, event_date, description
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${LOST_POST_COLUMNS}`,
      [
        userId,
        post.petName,
        post.species,
        post.breed,
        post.color,
        post.sex,
        post.neuterYn,
        post.region,
        post.eventDate,
        post.description,
      ],
    )

    const createdPost = postResult.rows[0]
    const images = []

    // Supabase에 업로드된 URL을 images 테이블에 순서대로 저장한다.
    // entries()의 index가 0인 첫 번째 사진만 대표 이미지로 지정한다.
    for (const [index, imageUrl] of imageUrls.entries()) {
      const imageResult = await client.query(
        `INSERT INTO images (post_type, lost_post_id, image_url, is_primary)
         VALUES ('lost', $1, $2, $3)
         RETURNING id, image_url, is_primary`,
        [createdPost.id, imageUrl, index === 0],
      )
      images.push(imageResult.rows[0])
    }

    // 공고와 모든 사진이 정상 저장된 경우에만 실제 DB에 반영한다.
    await client.query("COMMIT")

    // 컨트롤러가 명세 형태로 응답할 수 있도록 공고와 사진 배열을 합쳐 반환한다.
    return { ...createdPost, images }
  } catch (error) {
    // 중간에 하나라도 실패하면 불완전한 공고가 남지 않도록 모두 취소한다.
    await client.query("ROLLBACK")
    throw error
  } finally {
    // 성공·실패 여부와 관계없이 연결을 pool에 반드시 돌려준다.
    client.release()
  }
}

// TODO(3.2~3.4): 목록/상세/수정/삭제 쿼리는 각 API 구현 시 추가한다.