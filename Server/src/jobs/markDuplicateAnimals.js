import { pool } from "../db/pool.js"

const DUPLICATE_THRESHOLD = 0.9 // 이 이상이면 "같은 개체"로 판단 (조정 가능)

// 아직 중복 확인을 안 한 포인핸드 동물들을 대상으로,
// rescue_animals 쪽 사진 중 극단적으로 유사한 게 있는지 확인한다.
export async function markDuplicatePawinhandAnimals() {
  const { rows: candidates } = await pool.query(`
    SELECT pa.id AS pawinhand_animal_id, e.embedding::text AS embedding
    FROM pawinhand_animals pa
    JOIN images i ON i.pawinhand_animal_id = pa.id AND i.post_type = 'pawinhand'
    JOIN embeddings e ON e.image_id = i.id
    WHERE pa.duplicate_of_desertion_no IS NULL
  `)

  let markedCount = 0

  for (const { pawinhand_animal_id, embedding } of candidates) {
    const { rows: nearest } = await pool.query(
      `
      SELECT ra.desertion_no, (e.embedding <=> $1::vector) AS distance
      FROM embeddings e
      JOIN images i ON i.id = e.image_id AND i.post_type = 'rescue'
      JOIN rescue_animals ra ON ra.desertion_no = i.desertion_no
      ORDER BY e.embedding <=> $1::vector
      LIMIT 1
      `,
      [embedding],
    )

    if (nearest.length === 0) continue
    const similarity = 1 - nearest[0].distance
    if (similarity < DUPLICATE_THRESHOLD) continue

    await pool.query(
      `UPDATE pawinhand_animals SET duplicate_of_desertion_no = $1 WHERE id = $2`,
      [nearest[0].desertion_no, pawinhand_animal_id],
    )
    markedCount += 1
  }

  console.log(`[pawinhand] 중복 개체 표시: ${markedCount}건`)
}