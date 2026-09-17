import "dotenv/config"
import { setGlobalDispatcher, Agent } from "undici"
import { pool } from "../db/pool.js"

setGlobalDispatcher(
    new Agent({
        headersTimeout: 0,
        bodyTimeout: 0
    })
)

const AI_SERVER_URL = (
    process.env.AI_SERVER_URL ?? "http://localhost:8001"
).replace(/\/+$/, "")

const MODEL_VERSION_KEY = (
    process.env.EMBEDDING_MODEL_VERSION_KEY ?? ""
).trim()

const CHUNK_SIZE = 30

// rebuild 전 DB에서 선택한 모델 버전 확인 후 사용가능한 임베드 space확인한 다음 dog/cat 공간 확인하는 역할
async function getTargetEmbeddingSpaces() {
    if (!MODEL_VERSION_KEY) {
        throw new Error(
            "EMBEDDING_MODEL_VERSION_KEY가 설정되지 않았습니다."
        )
    }

    const { rows } = await pool.query(
        `
        SELECT
            es.id,
            es.space_key,
            es.species,
            es.checkpoint_name,
            es.embedding_dim
        FROM embedding_spaces es
        JOIN model_versions mv
            ON mv.id = es.model_version_id
        WHERE mv.version_key = $1
          AND es.is_usable = TRUE
        ORDER BY
            es.species,
            es.id
        `,
        [MODEL_VERSION_KEY]
    )

    if (rows.length === 0) {
        throw new Error(
            `사용 가능한 임베딩 공간이 없습니다: ${MODEL_VERSION_KEY}`
        )
    }

    const speciesSet = new Set()

    for (const space of rows) {
        if (
            space.species !== "개" &&
            space.species !== "고양이"
        ) {
            continue
        }

        if (speciesSet.has(space.species)) {
            throw new Error(
                "같은 모델 버전과 species에 " +
                "사용 가능한 임베딩 공간이 여러 개입니다: " +
                `model=${MODEL_VERSION_KEY}, ` +
                `species=${space.species}`
            )
        }

        speciesSet.add(space.species)
    }

    return rows.filter(
        (space) =>
            space.species === "개" ||
            space.species === "고양이"
    )
}

// 현재 모델 버전에 맞는 해당 임베딩 공간에 벡터 없는 이미지만 조회함
async function findPendingImages() {
    const { rows } = await pool.query(
        `
        WITH image_species AS (
            SELECT
                i.id,
                i.image_url,
                i.post_type,
                CASE
                    WHEN i.post_type = 'lost'
                        THEN lp.species
                    WHEN i.post_type = 'rescue'
                        THEN ra.up_kind_nm
                    WHEN i.post_type = 'pawinhand'
                        THEN pa.up_kind_nm
                END AS species
            FROM images i
            LEFT JOIN lost_posts lp
                ON lp.id = i.lost_post_id
            LEFT JOIN rescue_animals ra
                ON ra.desertion_no = i.desertion_no
            LEFT JOIN pawinhand_animals pa
                ON pa.id = i.pawinhand_animal_id
            WHERE i.post_type IN (
                'lost',
                'rescue',
                'pawinhand'
            )
        )
        SELECT
            image_species.id,
            image_species.image_url,
            image_species.post_type,
            image_species.species,
            es.id AS embedding_space_id,
            es.space_key
        FROM image_species
        JOIN embedding_spaces es
            ON es.species = image_species.species
           AND es.is_usable = TRUE
        JOIN model_versions mv
            ON mv.id = es.model_version_id
           AND mv.version_key = $1
        WHERE image_species.species IN (
            '개',
            '고양이'
        )
          AND NOT EXISTS (
              SELECT 1
              FROM embeddings e
              WHERE e.image_id = image_species.id
                AND e.embedding_space_id = es.id
          )
        ORDER BY image_species.id ASC
        `,
        [MODEL_VERSION_KEY]
    )

    return rows
}


async function rebuildEmbeddings() {
    const spaces = await getTargetEmbeddingSpaces()

    console.log(
        `대상 모델 버전: ${MODEL_VERSION_KEY}`
    )

    for (const space of spaces) {
        console.log(
            `임베딩 공간: ${space.space_key} ` +
            `(${space.species}, ${space.embedding_dim}차원)`
        )
    }

    const images = await findPendingImages()

    console.log(
        `재임베딩 대상: ${images.length}개 이미지`
    )

    if (images.length === 0) {
        console.log("재임베딩 대상 없음")
        return
    }

    let successCount = 0
    let duplicateSkippedCount = 0
    let failedCount = 0

    for (
        let i = 0;
        i < images.length;
        i += CHUNK_SIZE
    ) {
        const chunk = images.slice(
            i,
            i + CHUNK_SIZE
        )

        console.log(
            `진행: ${Math.min(
                i + CHUNK_SIZE,
                images.length
            )}/${images.length}`
        )

        try {
            const response = await fetch(
                `${AI_SERVER_URL}/embeddings/images`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        model_version_key: MODEL_VERSION_KEY,
                        images: chunk.map((image) => ({
                            id: image.id,
                            image_url: image.image_url,
                            species: image.species
                        }))
                    })
                }
            )

            if (!response.ok) {
                throw new Error(
                    `AI 서버 응답 오류: ${response.status}`
                )
            }

            const data = await response.json()

            for (const result of data.results) {
                if (result.status === "ok") {
                    successCount += 1
                } else if (result.status === "duplicate_skipped") {
                    duplicateSkippedCount += 1
                } else {
                    failedCount += 1
                }
            }

            console.log(
                `현재 성공 ${successCount} / 중복스킵 ${duplicateSkippedCount} / 실패 ${failedCount}`
            )
        } catch (error) {
            failedCount += chunk.length

            console.error(
                `청크 처리 실패 (${i}~${
                    i + chunk.length - 1
                }):`,
                error.message
            )
        }
    }

    console.log("")
    console.log("DINOv2 재임베딩 완료")
    console.log(`성공: ${successCount}`)
    console.log(`중복스킵: ${duplicateSkippedCount}`)
    console.log(`실패: ${failedCount}`)
}


rebuildEmbeddings()
    .catch((error) => {
        console.error(
            "재임베딩 실패:",
            error
        )

        process.exitCode = 1
    })
    .finally(async () => {
        await pool.end()
    })