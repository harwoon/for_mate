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
    for (const imageUrl of imageUrls) {
      const imageResult = await client.query(
        `INSERT INTO images (post_type, lost_post_id, image_url)
         VALUES ('lost', $1, $2)
         RETURNING id, image_url, created_at`,
        [createdPost.id, imageUrl],
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

// 3.3 실종 공고 상세 조회
// 공고가 존재하지 않으면 undefined를 반환하고, 존재하면 연결된 사진까지 조회한다.
export async function findById(id) {
  // is_owner 계산에 필요한 user_id도 조회하지만 서비스에서 외부 응답 전에 제거한다.
  const postResult = await pool.query(
    `SELECT
       id, user_id, pet_name, species, breed, color, sex, neuter_yn,
       region, event_date, description, status, created_at
     FROM lost_posts
     WHERE id = $1`,
    [id],
  )

  const post = postResult.rows[0]
  if (!post) return undefined

  // 해당 실종 공고에 속한 사진만 조회한다.
  // 대표 사진을 첫 번째로 보여주고, 나머지는 등록된 순서(id 오름차순)로 정렬한다.
  const imageResult = await pool.query(
    `SELECT id, image_url,created_at
     FROM images
     WHERE post_type = 'lost' AND lost_post_id = $1
     ORDER BY id ASC`,
    [id],
  )

  return { ...post, images: imageResult.rows }
}

// 3.2 실종 공고 목록 조회
export async function findMany({ filters, size, offset }) {
  const conditions = []
  const params = []

  // 값은 모두 파라미터로 전달해 SQL Injection을 방지한다.
  function addCondition(sql, value) {
    params.push(value)
    conditions.push(sql.replace("?", `$${params.length}`))
  }

  addCondition("lp.status = ?", filters.status)
  if (filters.species) addCondition("lp.species = ?", filters.species)
  if (filters.breed) addCondition("lp.breed = ?", filters.breed)
  if (filters.color) addCondition("lp.color = ?", filters.color)
  if (filters.region) addCondition("lp.region ILIKE '%' || ? || '%'", filters.region)
  if (filters.startDate) addCondition("lp.event_date >= ?", filters.startDate)
  if (filters.endDate) addCondition("lp.event_date <= ?", filters.endDate)

  const whereClause = `WHERE ${conditions.join(" AND ")}`

  // 필터 결과의 전체 개수를 별도로 조회해 전체 페이지 수를 계산할 수 있게 한다.
  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM lost_posts lp
     ${whereClause}`,
    params,
  )

  // LATERAL JOIN으로 각 공고의 대표 이미지 한 장만 가져온다.
  // 대표 이미지가 없다면 가장 먼저 등록된 이미지를 사용한다.
  const listParams = [...params, size, offset]
  const sizeParam = `$${params.length + 1}`
  const offsetParam = `$${params.length + 2}`
  const listResult = await pool.query(
    `SELECT
       lp.id, lp.pet_name, lp.species, lp.breed, lp.color,
       lp.region, lp.event_date, lp.status, lp.created_at,
       first_image.image_url AS first_image_url
     FROM lost_posts lp
     LEFT JOIN LATERAL (
       SELECT image_url
       FROM images
       WHERE post_type = 'lost' AND lost_post_id = lp.id
       ORDER BY id ASC
       LIMIT 1
     ) first_image ON TRUE
     ${whereClause}
     ORDER BY lp.created_at DESC, lp.id DESC
     LIMIT ${sizeParam} OFFSET ${offsetParam}`,
    listParams,
  )

  return {
    items: listResult.rows,
    total: countResult.rows[0].total,
  }
}

// 3.4 공고 정보, 기존 이미지 삭제, 새 이미지 추가를 하나의 트랜잭션으로 처리한다.
export async function updatePostWithImages({ id, userId, updates, deleteImageIds, imageUrls }) {
  const client = await pool.connect()

  try {
    await client.query("BEGIN")

    // 수정 중 공고가 삭제되거나 동시에 변경되지 않도록 행 잠금을 건다.
    const ownerResult = await client.query(
      `SELECT user_id FROM lost_posts WHERE id = $1 FOR UPDATE`,
      [id],
    )
    const owner = ownerResult.rows[0]

    if (!owner) {
      await client.query("ROLLBACK")
      return { outcome: "not_found" }
    }
    if (String(owner.user_id) !== String(userId)) {
      await client.query("ROLLBACK")
      return { outcome: "forbidden" }
    }

    const currentImageResult = await client.query(
      `SELECT id, image_url, created_at
       FROM images
       WHERE post_type = 'lost' AND lost_post_id = $1
       ORDER BY id ASC
       FOR UPDATE`,
      [id],
    )
    const currentImages = currentImageResult.rows
    const currentIds = new Set(currentImages.map((image) => String(image.id)))

    if (deleteImageIds.some((imageId) => !currentIds.has(String(imageId)))) {
      await client.query("ROLLBACK")
      return { outcome: "invalid_image_ids" }
    }

    const finalImageCount = currentImages.length - deleteImageIds.length + imageUrls.length
    if (finalImageCount < 1 || finalImageCount > 8) {
      await client.query("ROLLBACK")
      return { outcome: "invalid_image_count" }
    }

    // 전달된 공고 필드만 동적으로 UPDATE한다. 컬럼명은 서비스가 만든 허용 목록만 사용한다.
    const updateEntries = Object.entries(updates)
    if (updateEntries.length > 0) {
      const values = updateEntries.map(([, value]) => value)
      const assignments = updateEntries.map(
        ([column], index) => `${column} = $${index + 1}`,
      )
      values.push(id)
      await client.query(
        `UPDATE lost_posts
         SET ${assignments.join(", ")}
         WHERE id = $${values.length}`,
        values,
      )
    }

    let deletedImages = []
    if (deleteImageIds.length > 0) {
      const deletedResult = await client.query(
        `DELETE FROM images
         WHERE post_type = 'lost'
           AND lost_post_id = $1
           AND id = ANY($2::bigint[])
         RETURNING id, image_url`,
        [id, deleteImageIds],
      )
      deletedImages = deletedResult.rows
    }

    // 새 파일은 기존 이미지 뒤에 등록되며 대표 이미지는 마지막에 일괄 재지정한다.
    for (const imageUrl of imageUrls) {
      await client.query(
        `INSERT INTO images (
        post_type,
        lost_post_id,
        image_url
        )
         VALUES ('lost', $1, $2)`,
        [id, imageUrl],
      )
    }

    const postResult = await client.query(
      `SELECT
         id, user_id, pet_name, species, breed, color, sex, neuter_yn,
         region, event_date, description, status, created_at
       FROM lost_posts
       WHERE id = $1`,
      [id],
    )
    const imageResult = await client.query(
      `SELECT id, image_url, created_at
       FROM images
       WHERE post_type = 'lost' AND lost_post_id = $1
       ORDER BY id ASC`,
      [id],
    )

    await client.query("COMMIT")
    return {
      outcome: "ok",
      post: { ...postResult.rows[0], images: imageResult.rows },
      deletedImages,
    }
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// TODO(3.4): 상태 변경/삭제 쿼리는 해당 API 구현 시 추가한다.
