import { query } from "../../db/pool.js"
import { animalsSql, animalImageCondition } from "../rescue-animals/animal-source.js"

// 실종 공고 종 조회
export async function findLostPostSpecies(lostPostId) {
  const { rows } = await query(`SELECT species FROM lost_posts WHERE id = $1`, [lostPostId])
  return rows[0]?.species ?? null
}

// 모델 버전과 species에 해당하는 사용 가능한 임베딩 공간 조회
export async function findEmbeddingSpace(
  modelVersionKey,
  species
) {
  const { rows } = await query(
    `
    SELECT
      es.id,
      es.space_key,
      es.species,
      es.embedding_dim,
      es.checkpoint_name
    FROM embedding_spaces es
    JOIN model_versions mv
      ON mv.id = es.model_version_id
    WHERE mv.version_key = $1
      AND es.species = $2
      AND es.is_usable = TRUE
    ORDER BY es.id ASC
    `,
    [
      modelVersionKey,
      species
    ]
  )

  return rows
}


// 선택한 임베딩 공간의 실종 공고 벡터만 조회
export async function findLostPostEmbeddings(
  lostPostId,
  embeddingSpaceId
) {
  const { rows } = await query(
    `
    SELECT
      e.embedding::text AS embedding
    FROM embeddings e
    JOIN images i
      ON i.id = e.image_id
    WHERE i.post_type = 'lost'
      AND i.lost_post_id = $1
      AND e.embedding_space_id = $2
    ORDER BY i.id ASC
    `,
    [
      lostPostId,
      embeddingSpaceId
    ]
  )

  return rows.map(
    (row) => row.embedding
  )
}

// 같은 임베딩 공간 안에서 가장 가까운 구조동물 후보 K개 조회
// "ORDER BY 거리 LIMIT" 형태를 유지해 pgvector HNSW 인덱스를 사용한다.
export async function findNearestCandidates(
  embeddingLiteral,
  species,
  embeddingSpaceId,
  limit = 20
) {
  const [rescueResult, pawinhandResult] = await Promise.all([
    query(
      `
      SELECT
          ra.desertion_no AS ref_id,
          'rescue' AS source_type,
          (e.embedding <=> $1::vector) AS distance
      FROM embeddings e
      JOIN images i
          ON i.id = e.image_id
          AND i.post_type = 'rescue'
      JOIN rescue_animals ra
          ON ra.desertion_no = i.desertion_no
      WHERE e.embedding_space_id = $3
        AND (
            ra.notice_edt IS NULL
            OR ra.notice_edt >= CURRENT_DATE
        )
        AND ra.up_kind_nm = $2
      ORDER BY e.embedding <=> $1::vector
      LIMIT $4
      `,
      [
        embeddingLiteral,
        species,
        embeddingSpaceId,
        limit
      ]
    ),
    query(
      `
      SELECT
          pa.id AS ref_id,
          'pawinhand' AS source_type,
          (e.embedding <=> $1::vector) AS distance
      FROM embeddings e
      JOIN images i
          ON i.id = e.image_id
          AND i.post_type = 'pawinhand'
      JOIN pawinhand_animals pa
          ON pa.id = i.pawinhand_animal_id
      WHERE e.embedding_space_id = $3
        AND (
            pa.notice_edt IS NULL
            OR pa.notice_edt >= CURRENT_DATE
        )
        AND pa.up_kind_nm = $2
        AND pa.duplicate_of_desertion_no IS NULL
      ORDER BY e.embedding <=> $1::vector
      LIMIT $4
      `,
      [
        embeddingLiteral,
        species,
        embeddingSpaceId,
        limit
      ]
    )
  ])

  return [
    ...rescueResult.rows,
    ...pawinhandResult.rows
  ]
}

// 계산 결과를 이력으로 저장한다. 같은 날 같은 쌍이면 최신 값으로 덮어쓴다(캐시 아님, append 성격의 upsert).
export async function upsertMatches(sourcePostId, ranked) {
    const savedMatches = []
    const today = new Date().toISOString().slice(0, 10)
    for (const { source_type, ref_id, similarity } of ranked) {
        if (source_type === "rescue") {
            const { rows } = await query(
                `
                INSERT INTO matches (source_post_id, source_type, desertion_no, similarity_score, matched_date)
                VALUES ($1, 'rescue', $2, $3, $4)
                ON CONFLICT (source_post_id, desertion_no, matched_date) WHERE source_type = 'rescue'
                DO UPDATE SET similarity_score = EXCLUDED.similarity_score, created_at = NOW()
                RETURNING id
                `,
                [sourcePostId, ref_id, similarity, today]
            )
            savedMatches.push(rows[0])
        } else {
            const { rows } = await query(
                `
                INSERT INTO matches (source_post_id, source_type, pawinhand_animal_id, similarity_score, matched_date)
                VALUES ($1, 'pawinhand', $2, $3, $4)
                ON CONFLICT (source_post_id, pawinhand_animal_id, matched_date) WHERE source_type = 'pawinhand'
                DO UPDATE SET similarity_score = EXCLUDED.similarity_score, created_at = NOW()
                RETURNING id
                `,
                [sourcePostId, ref_id, similarity, today]
            )
            savedMatches.push(rows[0])
        }
    }
    return savedMatches
}

// 이번 요청에서 저장한 후보만 조회한다. 과거 매칭 이력은 목록에 섞지 않는다.
export async function findMatchCandidates(matchIds) {
    const { rows } = await query(
        `SELECT
            m.id AS match_id,
            r.animal_id::text AS animal_id,
            (
                SELECT i.image_url
                FROM images i
                WHERE ${animalImageCondition}
                ORDER BY i.id ASC
                LIMIT 1
            ) AS image_url,
            r.up_kind_nm AS species, r.kind_nm AS breed,
            r.color_cd AS color, r.color_tags, r.sex_cd AS sex,
            r.neuter_yn AS neuter,
            r.happen_place, r.region_sido, r.region_sigungu,
            TO_CHAR(r.happen_dt, 'YYYY-MM-DD') AS happen_dt,
            TO_CHAR(r.notice_edt, 'YYYY-MM-DD') AS notice_edt
        FROM matches m
        LEFT JOIN (${animalsSql}) r ON r.source_type = m.source_type
            AND r.animal_id = COALESCE(m.desertion_no, m.pawinhand_animal_id)
        WHERE m.id = ANY($1::bigint[])`,
        [matchIds]
    )
    return rows
}

// 매칭 상세 비교용 — 실종 공고 + 구조동물 정보를 한 번에 조회한다.
export async function findMatchById(matchId) {
  const { rows } = await query(
    `
    SELECT
      m.id, m.similarity_score, m.matched_date, m.source_type,
      lp.id AS lost_post_id, lp.user_id AS lost_post_owner_id,
      lp.pet_name, lp.species, lp.breed, lp.color, lp.sex, lp.region, lp.event_date,
      COALESCE(ra.desertion_no, pa.id) AS animal_ref_id,
      COALESCE(ra.up_kind_nm, pa.up_kind_nm) AS up_kind_nm,
      COALESCE(ra.kind_nm, pa.kind_nm) AS kind_nm,
      COALESCE(ra.color_tags, pa.color_tags) AS color_tags,
      COALESCE(ra.sex_cd, pa.sex_cd) AS sex_cd,
      COALESCE(ra.region_sido, pa.region_sido) AS region_sido,
      COALESCE(ra.region_sigungu, pa.region_sigungu) AS region_sigungu,
      COALESCE(ra.happen_place, pa.happen_place) AS happen_place,
      COALESCE(ra.happen_dt, pa.happen_dt) AS happen_dt
    FROM matches m
    JOIN lost_posts lp ON lp.id = m.source_post_id
    LEFT JOIN rescue_animals ra ON m.source_type = 'rescue' AND ra.desertion_no = m.desertion_no
    LEFT JOIN pawinhand_animals pa ON m.source_type = 'pawinhand' AND pa.id = m.pawinhand_animal_id
    WHERE m.id = $1
    `,
    [matchId],
  )
  return rows[0]
}
