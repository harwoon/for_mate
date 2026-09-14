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

const CHUNK_SIZE = 30


async function findPendingImages() {
    const { rows } = await pool.query(
        `
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
        LEFT JOIN embeddings e
            ON e.image_id = i.id
        WHERE i.post_type IN (
            'lost',
            'rescue',
            'pawinhand'
        )
          AND e.id IS NULL
        ORDER BY i.id ASC
        `
    )

    return rows.filter(
        (row) =>
            row.species === "개" ||
            row.species === "고양이"
    )
}


async function rebuildEmbeddings() {
    const images = await findPendingImages()

    console.log(
        `재임베딩 대상: ${images.length}개 이미지`
    )

    if (images.length === 0) {
        console.log("재임베딩 대상 없음")
        return
    }

    let successCount = 0
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
                } else {
                    failedCount += 1
                }
            }

            console.log(
                `현재 성공 ${successCount} / 실패 ${failedCount}`
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