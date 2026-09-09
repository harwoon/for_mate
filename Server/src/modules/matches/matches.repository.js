import { query } from "../../db/pool.js"

// 실종 공고에 연결된 임베딩 벡터들을 가져온다 (사진 장수만큼 나옴).
export async function findLostPostEmbeddings(lostPostId) {
  const { rows } = await query(
    `
    SELECT e.embedding::text AS embedding
    FROM embeddings e
    JOIN images i ON i.id = e.image_id
    WHERE i.post_type = 'lost' AND i.lost_post_id = $1
    `,
    [lostPostId],
  )
  return rows.map((row) => row.embedding) // "[0.1,0.2,...]" 형태 문자열
}

// 벡터 하나를 기준으로 가장 가까운 구조동물 후보 K개를 조회한다.
// "ORDER BY 거리 LIMIT" 형태를 유지해야 pgvector HNSW 인덱스가 실제로 사용된다.
export async function findNearestRescueCandidates(embeddingLiteral, limit = 20) {
  const { rows } = await query(
    `
    SELECT
      ra.desertion_no,
      (e.embedding <=> $1::vector) AS distance
    FROM embeddings e
    JOIN images i ON i.id = e.image_id AND i.post_type = 'rescue'
    JOIN rescue_animals ra ON ra.desertion_no = i.desertion_no
    WHERE ra.desertion_no <> ALL($2::bigint[])
      AND (ra.notice_edt IS NULL OR ra.notice_edt >= CURRENT_DATE)
    ORDER BY e.embedding <=> $1::vector
    LIMIT $3
    `,
    [embeddingLiteral, limit],
  )
  return rows // [{ desertion_no, distance }, ...]
}

// 계산 결과를 이력으로 저장한다. 같은 날 같은 쌍이면 최신 값으로 덮어쓴다(캐시 아님, append 성격의 upsert).
export async function upsertMatches(sourcePostId, ranked) {
  const today = new Date().toISOString().slice(0, 10)
  for (const { desertion_no, similarity } of ranked) {
    await query(
      `
      INSERT INTO matches (source_post_id, desertion_no, similarity_score, matched_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source_post_id, desertion_no, matched_date)
      DO UPDATE SET similarity_score = EXCLUDED.similarity_score, created_at = NOW()
      `,
      [sourcePostId, desertion_no, similarity, today],
    )
  }
}

// 매칭 상세 비교용 — 실종 공고 + 구조동물 정보를 한 번에 조회한다.
export async function findMatchById(matchId) {
  const { rows } = await query(
    `
    SELECT
      m.id, m.similarity_score, m.matched_date,
      lp.id AS lost_post_id, lp.user_id AS lost_post_owner_id,
      lp.pet_name, lp.species, lp.breed, lp.color, lp.sex, lp.region, lp.event_date,
      ra.desertion_no, ra.up_kind_nm, ra.kind_nm, ra.color_tags, ra.sex_cd,
      ra.region_sido, ra.region_sigungu, ra.happen_place, ra.happen_dt
    FROM matches m
    JOIN lost_posts lp ON lp.id = m.source_post_id
    JOIN rescue_animals ra ON ra.desertion_no = m.desertion_no
    WHERE m.id = $1
    `,
    [matchId],
  )
  return rows[0]
}