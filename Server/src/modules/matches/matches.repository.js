import { query } from "../../db/pool.js"
import { animalsSql, animalImageCondition } from "../rescue-animals/animal-source.js"


// 실종 공고 종 조회
export async function findLostPostSpecies(lostPostId) {
    const { rows } = await query(
        `
        SELECT species
        FROM lost_posts
        WHERE id = $1
        `,
        [lostPostId]
    )

    return rows[0]?.species ?? null
}


// 서비스에서 사용할 활성 모델 버전 조회
export async function findActiveModelVersions() {
    const { rows } = await query(
        `
        SELECT
            id,
            version_key,
            backbone,
            description
        FROM model_versions
        WHERE is_active = TRUE
        ORDER BY id ASC
        `
    )

    return rows
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
            AND mv.is_active = TRUE
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


// 같은 임베딩 공간 안에서 가장 가까운 매칭 후보 K개 조회
// "ORDER BY 거리 LIMIT" 형태를 유지해 pgvector HNSW 인덱스를 사용한다.
export async function findNearestCandidates(
    embeddingLiteral,
    species,
    embeddingSpaceId,
    limit = 20,
    filters = {},
    eventDate = null
) {
    const params = [
        embeddingLiteral,
        species,
        embeddingSpaceId,
        limit,
        filters.sex || null,
        filters.neuter || null,
        filters.sido || null,
        filters.sigungu || null,
        filters.start_date || null,
        filters.end_date || null,
        eventDate,
        filters.source_type || null
    ]

    const filterSql = (alias) => `
        AND (
            $5::text IS NULL
            OR (
                $5 = 'U'
                AND COALESCE(
                    NULLIF(${alias}.sex_cd, ''),
                    'U'
                ) IN ('Q', 'U')
            )
            OR ${alias}.sex_cd = $5
        )
        AND (
            $6::text IS NULL
            OR (
                $6 = 'U'
                AND COALESCE(
                    NULLIF(${alias}.neuter_yn, ''),
                    'U'
                ) = 'U'
            )
            OR ${alias}.neuter_yn = $6
        )
        AND (
            $7::text IS NULL
            OR ${alias}.region_sido = $7
        )
        AND (
            $8::text IS NULL
            OR ${alias}.region_sigungu = $8
        )
        AND (
            $9::date IS NULL
            OR ${alias}.happen_dt >= $9::date
        )
        AND (
            $10::date IS NULL
            OR ${alias}.happen_dt <= $10::date
        )
        AND (
            $11::date IS NULL
            OR ${alias}.happen_dt IS NULL
            OR ${alias}.happen_dt >= $11::date
        )
    `

    const [
        rescueResult,
        pawinhandResult,
        foundResult
    ] = await Promise.all([
        query(
            `
            SELECT
                ra.desertion_no AS ref_id,
                'rescue' AS source_type,
                (e.embedding <=> $1::vector) AS distance,
                ra.happen_dt,
                ra.notice_edt
            FROM embeddings e
            JOIN images i
                ON i.id = e.image_id
                AND i.post_type = 'rescue'
            JOIN rescue_animals ra
                ON ra.desertion_no = i.desertion_no
            WHERE e.embedding_space_id = $3
                AND (
                    $12::text IS NULL
                    OR $12 = 'rescue'
                )
                AND (
                    ra.notice_edt IS NULL
                    OR ra.notice_edt >= CURRENT_DATE
                )
                AND ra.up_kind_nm = $2
                ${filterSql("ra")}
            ORDER BY e.embedding <=> $1::vector
            LIMIT $4
            `,
            params
        ),
        query(
            `
            SELECT
                pa.id AS ref_id,
                'pawinhand' AS source_type,
                (e.embedding <=> $1::vector) AS distance,
                pa.happen_dt,
                pa.notice_edt
            FROM embeddings e
            JOIN images i
                ON i.id = e.image_id
                AND i.post_type = 'pawinhand'
            JOIN pawinhand_animals pa
                ON pa.id = i.pawinhand_animal_id
            WHERE e.embedding_space_id = $3
                AND (
                    $12::text IS NULL
                    OR $12 = 'pawinhand'
                )
                AND (
                    pa.notice_edt IS NULL
                    OR pa.notice_edt >= CURRENT_DATE
                )
                AND pa.up_kind_nm = $2
                AND pa.duplicate_of_desertion_no IS NULL
                ${filterSql("pa")}
            ORDER BY e.embedding <=> $1::vector
            LIMIT $4
            `,
            params
        ),
        query(
            `
            SELECT
                fp.id AS ref_id,
                'found' AS source_type,
                (e.embedding <=> $1::vector) AS distance,
                fp.find_date AS happen_dt,
                NULL::date AS notice_edt
            FROM embeddings e
            JOIN images i
                ON i.id = e.image_id
                AND i.post_type = 'found'
            JOIN found_posts fp
                ON fp.id = i.found_post_id
            WHERE e.embedding_space_id = $3
                AND (
                    $12::text IS NULL
                    OR $12 = 'found'
                )
                AND fp.status = 'active'
                AND fp.species = $2

                AND ($5::text IS NULL OR $5 = 'U')
                AND ($6::text IS NULL OR $6 = 'U')

                AND (
                    $7::text IS NULL
                    OR fp.region ILIKE '%' || $7 || '%'
                )
                AND (
                    $8::text IS NULL
                    OR fp.region ILIKE '%' || $8 || '%'
                )
                AND (
                    $9::date IS NULL
                    OR fp.find_date >= $9::date
                )
                AND (
                    $10::date IS NULL
                    OR fp.find_date <= $10::date
                )
                AND (
                    $11::date IS NULL
                    OR fp.find_date >= $11::date
                )
            ORDER BY e.embedding <=> $1::vector
            LIMIT $4
            `,
            params
        )
    ])

    return [
        ...rescueResult.rows,
        ...pawinhandResult.rows,
        ...foundResult.rows
    ]
}


// 계산 결과를 이력으로 저장한다.
// 같은 날 같은 쌍이면 최신 값으로 덮어쓴다.
// 캐시가 아니라 append 성격의 upsert.
export async function upsertMatches(
    sourcePostId,
    ranked
) {
    const savedMatches = []

    const today = new Date()
        .toISOString()
        .slice(0, 10)

    for (const {
        source_type,
        ref_id,
        similarity
    } of ranked) {
        if (source_type === "rescue") {
            const { rows } = await query(
                `
                INSERT INTO matches (
                    source_post_id,
                    source_type,
                    desertion_no,
                    similarity_score,
                    matched_date
                )
                VALUES (
                    $1,
                    'rescue',
                    $2,
                    $3,
                    $4
                )
                ON CONFLICT (
                    source_post_id,
                    desertion_no,
                    matched_date
                )
                WHERE source_type = 'rescue'
                DO UPDATE SET
                    similarity_score =
                        EXCLUDED.similarity_score,
                    created_at = NOW()
                RETURNING id
                `,
                [
                    sourcePostId,
                    ref_id,
                    similarity,
                    today
                ]
            )

            savedMatches.push(
                rows[0]
            )
        } else if (
            source_type === "pawinhand"
        ) {
            const { rows } = await query(
                `
                INSERT INTO matches (
                    source_post_id,
                    source_type,
                    pawinhand_animal_id,
                    similarity_score,
                    matched_date
                )
                VALUES (
                    $1,
                    'pawinhand',
                    $2,
                    $3,
                    $4
                )
                ON CONFLICT (
                    source_post_id,
                    pawinhand_animal_id,
                    matched_date
                )
                WHERE source_type = 'pawinhand'
                DO UPDATE SET
                    similarity_score =
                        EXCLUDED.similarity_score,
                    created_at = NOW()
                RETURNING id
                `,
                [
                    sourcePostId,
                    ref_id,
                    similarity,
                    today
                ]
            )

            savedMatches.push(
                rows[0]
            )
        } else if (
            source_type === "found"
        ) {
            const { rows } = await query(
                `
                INSERT INTO matches (
                    source_post_id,
                    source_type,
                    found_post_id,
                    similarity_score,
                    matched_date
                )
                VALUES (
                    $1,
                    'found',
                    $2,
                    $3,
                    $4
                )
                ON CONFLICT (
                    source_post_id,
                    found_post_id,
                    matched_date
                )
                WHERE source_type = 'found'
                DO UPDATE SET
                    similarity_score =
                        EXCLUDED.similarity_score,
                    created_at = NOW()
                RETURNING id
                `,
                [
                    sourcePostId,
                    ref_id,
                    similarity,
                    today
                ]
            )

            savedMatches.push(
                rows[0]
            )
        }
    }

    return savedMatches
}


// 이번 요청에서 저장한 후보만 조회한다.
// 과거 매칭 이력은 목록에 섞지 않는다.
export async function findMatchCandidates(matchIds) {
    const { rows } = await query(
        `
        SELECT
            m.id AS match_id,

            COALESCE(
                r.animal_id,
                fp.id
            )::text AS animal_id,

            CASE
                WHEN m.source_type = 'found' THEN (
                    SELECT i.image_url
                    FROM images i
                    WHERE i.post_type = 'found'
                        AND i.found_post_id = fp.id
                    ORDER BY i.id ASC
                    LIMIT 1
                )
                ELSE (
                    SELECT i.image_url
                    FROM images i
                    WHERE ${animalImageCondition}
                    ORDER BY i.id ASC
                    LIMIT 1
                )
            END AS image_url,

            COALESCE(
                r.up_kind_nm,
                fp.species
            ) AS species,

            COALESCE(
                r.kind_nm,
                fp.breed
            ) AS breed,

            COALESCE(
                r.color_cd,
                fp.color
            ) AS color,

            CASE
                WHEN m.source_type = 'found'
                    AND fp.color IS NOT NULL
                    THEN ARRAY[fp.color]
                ELSE r.color_tags
            END AS color_tags,

            CASE
                WHEN m.source_type = 'found'
                    THEN NULL
                ELSE r.sex_cd
            END AS sex,

            CASE
                WHEN m.source_type = 'found'
                    THEN NULL
                ELSE r.neuter_yn
            END AS neuter,

            CASE
                WHEN m.source_type = 'found'
                    THEN fp.region
                ELSE r.happen_place
            END AS happen_place,

            COALESCE(fp.region, r.happen_place) AS region,

            CASE
                WHEN m.source_type = 'found'
                    THEN NULL
                ELSE r.region_sido
            END AS region_sido,

            CASE
                WHEN m.source_type = 'found'
                    THEN NULL
                ELSE r.region_sigungu
            END AS region_sigungu,

            TO_CHAR(
                COALESCE(
                    r.happen_dt,
                    fp.find_date
                ),
                'YYYY-MM-DD'
            ) AS happen_dt,

            TO_CHAR(
                r.notice_edt,
                'YYYY-MM-DD'
            ) AS notice_edt

        FROM matches m

        LEFT JOIN (${animalsSql}) r
            ON r.source_type = m.source_type
            AND r.animal_id = COALESCE(
                m.desertion_no,
                m.pawinhand_animal_id
            )

        LEFT JOIN found_posts fp
            ON m.source_type = 'found'
            AND fp.id = m.found_post_id

        WHERE m.id = ANY($1::bigint[])
        `,
        [matchIds]
    )

    return rows
}


// 매칭 상세 비교용
// 실종 공고 + 매칭 후보 정보를 한 번에 조회한다.
export async function findMatchById(matchId) {
    const { rows } = await query(
        `
        SELECT
            m.id,
            m.similarity_score,
            m.matched_date,
            m.source_type,

            lp.id AS lost_post_id,
            lp.user_id AS lost_post_owner_id,
            lp.pet_name,
            lp.species,
            lp.breed,
            lp.color,
            lp.sex,
            lp.region,
            lp.event_date,

            COALESCE(
                ra.desertion_no,
                pa.id,
                fp.id
            ) AS animal_ref_id,

            COALESCE(
                ra.up_kind_nm,
                pa.up_kind_nm,
                fp.species
            ) AS up_kind_nm,

            COALESCE(
                ra.kind_nm,
                pa.kind_nm,
                fp.breed
            ) AS kind_nm,

            CASE
                WHEN m.source_type = 'found'
                    AND fp.color IS NOT NULL
                    THEN ARRAY[fp.color]
                ELSE COALESCE(
                    ra.color_tags,
                    pa.color_tags
                )
            END AS color_tags,

            COALESCE(
                ra.sex_cd,
                pa.sex_cd
            ) AS sex_cd,

            COALESCE(
                ra.region_sido,
                pa.region_sido
            ) AS region_sido,

            COALESCE(
                ra.region_sigungu,
                pa.region_sigungu
            ) AS region_sigungu,

            CASE
                WHEN m.source_type = 'found'
                    THEN fp.region
                ELSE COALESCE(
                    ra.happen_place,
                    pa.happen_place
                )
            END AS happen_place,

            CASE
                WHEN m.source_type = 'found'
                    THEN fp.find_date
                ELSE COALESCE(
                    ra.happen_dt,
                    pa.happen_dt
                )
            END AS happen_dt

        FROM matches m

        JOIN lost_posts lp
            ON lp.id = m.source_post_id

        LEFT JOIN rescue_animals ra
            ON m.source_type = 'rescue'
            AND ra.desertion_no = m.desertion_no

        LEFT JOIN pawinhand_animals pa
            ON m.source_type = 'pawinhand'
            AND pa.id = m.pawinhand_animal_id

        LEFT JOIN found_posts fp
            ON m.source_type = 'found'
            AND fp.id = m.found_post_id

        WHERE m.id = $1
            AND (m.source_type <> 'found' OR fp.status <> 'blind')
        `,
        [matchId]
    )

    return rows[0]
}
