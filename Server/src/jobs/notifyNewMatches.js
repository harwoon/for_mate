import { pool } from "../db/pool.js"

const SIMILARITY_THRESHOLD = 0.70 // 이 이상일 때만 알림 생성 (조정 가능)
const CANDIDATE_LIMIT_PER_VECTOR = 20

// postType: 'rescue' | 'pawinhand'
// animalRefs: 이번 배치에서 처리한 동물 식별자 목록 (rescue=desertion_no, pawinhand=pawinhand_animal_id)
export async function notifyNewMatches(postType, animalRefs) {
  if (animalRefs.length === 0) return

  const refColumn = postType === "rescue" ? "desertion_no" : "pawinhand_animal_id"

  for (const animalRef of animalRefs) {
    const { rows: vectors } = await pool.query(
      `
      SELECT e.embedding::text AS embedding
      FROM embeddings e
      JOIN images i ON i.id = e.image_id
      WHERE i.post_type = $1 AND i.${refColumn} = $2
      `,
      [postType, animalRef],
    )
    if (vectors.length === 0) continue // 임베딩 추출이 실패했던 동물은 자연스럽게 건너뜀

    const bestByLostPost = new Map()

    for (const { embedding } of vectors) {
      const { rows: candidates } = await pool.query(
        `
        SELECT lp.id AS lost_post_id, lp.user_id, (e.embedding <=> $1::vector) AS distance
        FROM embeddings e
        JOIN images i ON i.id = e.image_id AND i.post_type = 'lost'
        JOIN lost_posts lp ON lp.id = i.lost_post_id
        WHERE lp.status = 'active'
        ORDER BY e.embedding <=> $1::vector
        LIMIT $2
        `,
        [embedding, CANDIDATE_LIMIT_PER_VECTOR],
      )
      for (const { lost_post_id, user_id, distance } of candidates) {
        const key = Number(lost_post_id)
        const current = bestByLostPost.get(key)
        if (current === undefined || distance < current.distance) {
          bestByLostPost.set(key, { distance, userId: Number(user_id) })
        }
      }
    }

    for (const [lostPostId, { distance, userId }] of bestByLostPost.entries()) {
      const similarity = 1 - distance
      if (similarity < SIMILARITY_THRESHOLD) continue

      await pool.query(
        `
        INSERT INTO notifications (user_id, lost_post_id, source_type, ${refColumn}, similarity_score)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        `,
        [userId, lostPostId, postType, animalRef, similarity],
      )
    }
  }
}