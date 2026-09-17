import { pool } from "../db/pool.js"


const SIMILARITY_THRESHOLD = 0.50
const CANDIDATE_LIMIT_PER_VECTOR = 20


// 출처별 DB 구조
const SOURCE_CONFIG = {
    rescue: {
        refColumn: "desertion_no",
        table: "rescue_animals",
        idColumn: "desertion_no",
        dateColumn: "happen_dt",
        speciesColumn: "up_kind_nm",
        extraWhere: ""
    },

    pawinhand: {
        refColumn: "pawinhand_animal_id",
        table: "pawinhand_animals",
        idColumn: "id",
        dateColumn: "happen_dt",
        speciesColumn: "up_kind_nm",
        extraWhere: `
            AND duplicate_of_desertion_no IS NULL
        `
    },

    found: {
        refColumn: "found_post_id",
        table: "found_posts",
        idColumn: "id",
        dateColumn: "find_date",
        speciesColumn: "species",
        extraWhere: `
            AND status = 'active'
        `
    }
}


// 새로 임베딩된 구조/포인핸드/발견제보 후보를
// 기존 실종 공고와 비교하여 알림을 생성한다.
export async function notifyNewMatches(
    postType,
    animalRefs
) {
    if (
        !Array.isArray(animalRefs) ||
        animalRefs.length === 0
    ) {
        return
    }

    const config = SOURCE_CONFIG[postType]

    if (!config) {
        throw new Error(
            `지원하지 않는 알림 출처입니다: ${postType}`
        )
    }

    const {
        refColumn,
        table,
        idColumn,
        dateColumn,
        speciesColumn,
        extraWhere
    } = config

    for (const animalRef of animalRefs) {
        // 현재 후보의 날짜와 종 조회
        const { rows: sourceRows } =
            await pool.query(
                `
                SELECT
                    ${dateColumn} AS happen_date,
                    ${speciesColumn} AS species
                FROM ${table}
                WHERE ${idColumn} = $1
                ${extraWhere}
                `,
                [animalRef]
            )

        const source = sourceRows[0]

        // 삭제/블라인드/중복처리 등으로 현재 사용할 수 없는 후보
        if (!source) {
            continue
        }

        if (
            source.species !== "개" &&
            source.species !== "고양이"
        ) {
            continue
        }

        const happenDate =
            source.happen_date ?? null

        /*
         * 현재 활성 모델 + 사용 가능한 임베딩 공간만 사용한다.
         *
         * 특히 found의 species가 수정된 경우
         * 과거 species 공간의 임베딩이 남아 있더라도
         * es.species = 현재 species 조건으로 제외한다.
         */
        const { rows: vectors } =
            await pool.query(
                `
                SELECT
                    e.embedding::text AS embedding,
                    e.embedding_space_id
                FROM embeddings e
                JOIN images i
                    ON i.id = e.image_id
                JOIN embedding_spaces es
                    ON es.id = e.embedding_space_id
                JOIN model_versions mv
                    ON mv.id = es.model_version_id
                WHERE i.post_type = $1
                    AND i.${refColumn} = $2
                    AND es.species = $3
                    AND es.is_usable = TRUE
                    AND mv.is_active = TRUE
                ORDER BY
                    e.embedding_space_id ASC,
                    e.id ASC
                `,
                [
                    postType,
                    animalRef,
                    source.species
                ]
            )

        // 임베딩이 아직 없는 후보는 건너뜀
        if (vectors.length === 0) {
            continue
        }

        const bestByLostPost = new Map()

        for (const {
            embedding,
            embedding_space_id
        } of vectors) {
            /*
             * 같은 embedding_space_id 안에서만 비교한다.
             *
             * 모델 버전이나 species가 다른 벡터 공간과
             * 섞어서 유사도를 계산하지 않는다.
             */
            const { rows: candidates } =
                await pool.query(
                    `
                    SELECT
                        lp.id AS lost_post_id,
                        lp.user_id,
                        (
                            e.embedding <=>
                            $1::vector
                        ) AS distance
                    FROM embeddings e
                    JOIN images i
                        ON i.id = e.image_id
                        AND i.post_type = 'lost'
                    JOIN lost_posts lp
                        ON lp.id = i.lost_post_id
                    WHERE e.embedding_space_id = $2
                        AND lp.status = 'active'
                        AND lp.species = $5
                        AND (
                            $4::date IS NULL
                            OR lp.event_date <= $4::date
                        )
                    ORDER BY
                        e.embedding <=> $1::vector
                    LIMIT $3
                    `,
                    [
                        embedding,
                        embedding_space_id,
                        CANDIDATE_LIMIT_PER_VECTOR,
                        happenDate,
                        source.species
                    ]
                )

            for (const {
                lost_post_id,
                user_id,
                distance
            } of candidates) {
                const key =
                    Number(lost_post_id)

                const current =
                    bestByLostPost.get(key)

                // 동일 실종 공고의 여러 사진 중
                // 가장 높은 유사도만 사용
                if (
                    current === undefined ||
                    distance < current.distance
                ) {
                    bestByLostPost.set(
                        key,
                        {
                            distance,
                            userId: Number(user_id)
                        }
                    )
                }
            }
        }

        for (const [
            lostPostId,
            {
                distance,
                userId
            }
        ] of bestByLostPost.entries()) {
            const similarity =
                1 - distance

            if (
                similarity <
                SIMILARITY_THRESHOLD
            ) {
                continue
            }

            await pool.query(
                `
                INSERT INTO notifications (
                    user_id,
                    lost_post_id,
                    source_type,
                    ${refColumn},
                    similarity_score
                )
                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5
                )
                ON CONFLICT DO NOTHING
                `,
                [
                    userId,
                    lostPostId,
                    postType,
                    animalRef,
                    similarity
                ]
            )
        }
    }
}