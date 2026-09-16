// 기존에 저장된 구조동물/포인핸드 임베딩 중, 같은 동물 안에서 근접 중복인 것을 정리하는 1회성 백필.
// 라이브 파이프라인(ML/scripts/extract_embeddings.py의 is_duplicate_within_animal)과
// 같은 기준(코사인 유사도, 기본 0.97)으로 판정한다. images 행(사진)은 그대로 두고 embeddings 행만 지운다.
//
// 실행: node src/jobs/backfillDedupEmbeddings.js         (dry-run, 아무것도 지우지 않음)
//       node src/jobs/backfillDedupEmbeddings.js --apply (실제로 삭제)
//       DEDUP_SIMILARITY_THRESHOLD=0.98 node src/jobs/backfillDedupEmbeddings.js

import "dotenv/config"
import { pool } from "../db/pool.js"

const SIMILARITY_THRESHOLD = Number(process.env.DEDUP_SIMILARITY_THRESHOLD ?? 0.97)
const apply = process.argv.includes("--apply")

const POST_TYPES = [
    { postType: "rescue", refCol: "desertion_no" },
    { postType: "pawinhand", refCol: "pawinhand_animal_id" },
]

function parseVector(text) {
    // pgvector text 표현: "[0.1,0.2,...]"
    return text
        .slice(1, -1)
        .split(",")
        .map(Number)
}

function cosineSimilarity(a, b) {
    let dot = 0
    let normA = 0
    let normB = 0
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// 그룹(같은 동물) 안에서 e.id 오름차순(=먼저 추출된 순서)으로 순회하며,
// 이미 채택된 임베딩 중 하나와 유사도가 threshold 이상이면 중복으로 판정한다.
// 라이브 엔드포인트가 매번 "이 시점까지 채택된 것들과 비교"하는 것과 동일한 규칙.
function findDuplicatesInGroup(rows) {
    const kept = []
    const duplicates = []

    for (const row of rows) {
        const vector = parseVector(row.embedding)
        let matchedWith = null

        for (const keptRow of kept) {
            const similarity = cosineSimilarity(vector, keptRow.vector)
            if (similarity >= SIMILARITY_THRESHOLD) {
                matchedWith = { keptRow, similarity }
                break
            }
        }

        if (matchedWith) {
            duplicates.push({
                embeddingId: row.embedding_id,
                imageId: row.image_id,
                keptImageId: matchedWith.keptRow.image_id,
                similarity: matchedWith.similarity,
            })
        } else {
            kept.push({ image_id: row.image_id, vector })
        }
    }

    return duplicates
}

async function findDuplicatesForPostType(postType, refCol) {
    const { rows } = await pool.query(
        `
        SELECT
            e.id AS embedding_id,
            e.image_id,
            e.embedding::text AS embedding,
            i.${refCol} AS ref_value
        FROM embeddings e
        JOIN images i ON i.id = e.image_id
        WHERE i.post_type = $1
        ORDER BY i.${refCol} ASC, e.id ASC
        `,
        [postType],
    )

    const duplicates = []
    let groupRef = undefined
    let groupRows = []

    const flushGroup = () => {
        if (groupRows.length > 1) {
            duplicates.push(
                ...findDuplicatesInGroup(groupRows).map((d) => ({ ...d, postType, refCol, refValue: groupRef })),
            )
        }
        groupRows = []
    }

    for (const row of rows) {
        if (row.ref_value !== groupRef) {
            flushGroup()
            groupRef = row.ref_value
        }
        groupRows.push(row)
    }
    flushGroup()

    return { totalEmbeddings: rows.length, duplicates }
}

async function run() {
    console.log(
        `[backfill-dedup] 시작 (threshold=${SIMILARITY_THRESHOLD}, mode=${apply ? "APPLY(실제 삭제)" : "DRY-RUN"})`,
    )

    const allDuplicates = []

    for (const { postType, refCol } of POST_TYPES) {
        const { totalEmbeddings, duplicates } = await findDuplicatesForPostType(postType, refCol)
        const affectedAnimals = new Set(duplicates.map((d) => d.refValue)).size

        console.log("")
        console.log(`[${postType}] 전체 임베딩 ${totalEmbeddings}개 중 중복 판정 ${duplicates.length}개 (영향받는 동물 ${affectedAnimals}마리)`)

        for (const d of duplicates.slice(0, 10)) {
            console.log(
                `  - ${postType} ${refCol}=${d.refValue}: image_id=${d.imageId} 가 image_id=${d.keptImageId} 와 유사도 ${d.similarity.toFixed(4)} → 중복`,
            )
        }
        if (duplicates.length > 10) {
            console.log(`  ... 외 ${duplicates.length - 10}건 더`)
        }

        allDuplicates.push(...duplicates)
    }

    console.log("")
    console.log(`총 삭제 대상 embeddings: ${allDuplicates.length}개`)

    if (!apply) {
        console.log("")
        console.log("DRY-RUN입니다. 실제로 지우려면 --apply 옵션을 붙여서 다시 실행하세요.")
        await pool.end()
        return
    }

    if (allDuplicates.length === 0) {
        console.log("삭제할 것이 없습니다.")
        await pool.end()
        return
    }

    const ids = allDuplicates.map((d) => d.embeddingId)
    const { rowCount } = await pool.query(`DELETE FROM embeddings WHERE id = ANY($1::bigint[])`, [ids])
    console.log(`삭제 완료: embeddings ${rowCount}개 (images 행은 그대로 유지됨)`)

    await pool.end()
}

run().catch((error) => {
    console.error("[backfill-dedup] 실패:", error.message)
    process.exitCode = 1
})
