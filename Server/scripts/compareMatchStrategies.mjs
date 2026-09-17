import {
    findEmbeddingSpace,
    findLostPostEmbeddings,
    findLostPostSpecies,
    findNearestCandidates
} from "../src/modules/matches/matches.repository.js"

import { pool } from "../src/db/pool.js"

const lostPostId = Number(process.argv[2])
const targetAnimalId = Number(process.argv[3])
const repeatBonus = Number(process.argv[4] ?? 0.05)
const repeatTopN = Number(process.argv[5] ?? 10)
const modelVersionKey = String(process.argv[6] ?? "").trim()

const CANDIDATE_LIMIT_PER_VECTOR = 100
const RANK_POINT_LIMIT = 10

if (
    !Number.isInteger(lostPostId) ||
    !Number.isInteger(targetAnimalId) ||
    !modelVersionKey
) {
    console.error(
        "사용법: node compareMatchStrategies.mjs " +
        "<lostPostId> <targetAnimalId> " +
        "[repeatBonus] [repeatTopN] <modelVersionKey>"
    )

    process.exit(1)
}

function keyOf(candidate) {
    return `${candidate.source_type}:${candidate.ref_id}`
}

function dedupeCandidates(candidates) {
    const bestByAnimal = new Map()

    for (const {
        ref_id,
        source_type,
        distance
    } of candidates) {
        const candidate = {
            source_type,
            ref_id: Number(ref_id),
            similarity: 1 - Number(distance)
        }

        const key = keyOf(candidate)
        const current = bestByAnimal.get(key)

        if (
            current === undefined ||
            candidate.similarity > current.similarity
        ) {
            bestByAnimal.set(
                key,
                candidate
            )
        }
    }

    return [...bestByAnimal.values()]
        .sort(
            (a, b) =>
                b.similarity -
                a.similarity
        )
}

function baselineRanking(perVectorCandidates) {
    const bestByAnimal = new Map()

    for (const candidates of perVectorCandidates) {
        for (const candidate of candidates) {
            const key = keyOf(candidate)
            const current = bestByAnimal.get(key)

            if (
                current === undefined ||
                candidate.similarity >
                    current.similarity
            ) {
                bestByAnimal.set(
                    key,
                    {
                        ...candidate
                    }
                )
            }
        }
    }

    return [...bestByAnimal.values()]
        .sort(
            (a, b) =>
                b.similarity -
                a.similarity
        )
        .map(
            (candidate, index) => ({
                ...candidate,
                rank: index + 1
            })
        )
}

function repeatBonusRanking(
    perVectorCandidates,
    bonus,
    topN
) {
    const aggregated = new Map()

    for (const candidates of perVectorCandidates) {
        // 전체 후보에서는 최고 유사도만 저장
        for (const candidate of candidates) {
            const key = keyOf(candidate)
            const current = aggregated.get(key)

            if (current === undefined) {
                aggregated.set(
                    key,
                    {
                        ...candidate,
                        max_similarity:
                            candidate.similarity,
                        hit_count: 0
                    }
                )

                continue
            }

            current.max_similarity =
                Math.max(
                    current.max_similarity,
                    candidate.similarity
                )
        }

        // 각 실종사진의 상위 N개 후보만
        // 반복 등장으로 인정
        candidates
            .slice(0, topN)
            .forEach((candidate) => {
                const key = keyOf(candidate)
                const current = aggregated.get(key)

                current.hit_count += 1
            })
    }

    return [...aggregated.values()]
        .map((candidate) => {
            const repeatCount =
                Math.max(
                    candidate.hit_count - 1,
                    0
                )

            const repeatBonus =
                repeatCount * bonus

            const rankingScore =
                candidate.max_similarity +
                repeatBonus

            return {
                source_type:
                    candidate.source_type,
                ref_id:
                    candidate.ref_id,
                similarity:
                    candidate.max_similarity,
                hit_count:
                    candidate.hit_count,
                repeat_count:
                    repeatCount,
                repeat_bonus:
                    repeatBonus,
                ranking_score:
                    rankingScore
            }
        })
        .sort((a, b) => {
            if (
                b.ranking_score !==
                a.ranking_score
            ) {
                return (
                    b.ranking_score -
                    a.ranking_score
                )
            }

            return (
                b.similarity -
                a.similarity
            )
        })
        .map(
            (candidate, index) => ({
                ...candidate,
                rank: index + 1
            })
        )
}

function rankPointRanking(
    perVectorCandidates
) {
    const aggregated = new Map()

    for (const candidates of perVectorCandidates) {
        for (const candidate of candidates) {
            const key = keyOf(candidate)
            const current = aggregated.get(key)

            if (current === undefined) {
                aggregated.set(
                    key,
                    {
                        ...candidate,
                        max_similarity:
                            candidate.similarity,
                        rank_score: 0,
                        hit_count: 0,
                        best_rank: null
                    }
                )

                continue
            }

            current.max_similarity =
                Math.max(
                    current.max_similarity,
                    candidate.similarity
                )
        }

        candidates
            .slice(
                0,
                RANK_POINT_LIMIT
            )
            .forEach(
                (candidate, index) => {
                    const key =
                        keyOf(candidate)

                    const current =
                        aggregated.get(key)

                    const rank =
                        index + 1

                    const point =
                        RANK_POINT_LIMIT -
                        index

                    current.rank_score +=
                        point

                    current.hit_count += 1

                    if (
                        current.best_rank === null ||
                        rank <
                            current.best_rank
                    ) {
                        current.best_rank =
                            rank
                    }
                }
            )
    }

    return [...aggregated.values()]
        .map((candidate) => ({
            source_type:
                candidate.source_type,
            ref_id:
                candidate.ref_id,
            similarity:
                candidate.max_similarity,
            rank_score:
                candidate.rank_score,
            hit_count:
                candidate.hit_count,
            best_rank:
                candidate.best_rank
        }))
        .sort((a, b) => {
            if (
                b.rank_score !==
                a.rank_score
            ) {
                return (
                    b.rank_score -
                    a.rank_score
                )
            }

            if (
                b.hit_count !==
                a.hit_count
            ) {
                return (
                    b.hit_count -
                    a.hit_count
                )
            }

            return (
                b.similarity -
                a.similarity
            )
        })
        .map(
            (candidate, index) => ({
                ...candidate,
                rank: index + 1
            })
        )
}

function findTarget(
    ranking,
    targetId
) {
    return ranking.find(
        (candidate) =>
            candidate.source_type ===
                "rescue" &&
            candidate.ref_id ===
                targetId
    )
}

async function main() {
    const species =
        await findLostPostSpecies(
            lostPostId
        )

    if (!species) {
        throw new Error(
            `실종 공고를 찾을 수 없습니다: ${lostPostId}`
        )
    }

    const embeddingSpaces =
        await findEmbeddingSpace(
            modelVersionKey,
            species
        )

    if (embeddingSpaces.length === 0) {
        throw new Error(
            "사용 가능한 임베딩 공간이 없습니다: " +
            `model=${modelVersionKey}, ` +
            `species=${species}`
        )
    }

    if (embeddingSpaces.length > 1) {
        throw new Error(
            "사용 가능한 임베딩 공간이 여러 개입니다: " +
            `model=${modelVersionKey}, ` +
            `species=${species}`
        )
    }

    const embeddingSpace =
        embeddingSpaces[0]

    const vectors =
        await findLostPostEmbeddings(
            lostPostId,
            embeddingSpace.id
        )

    if (vectors.length === 0) {
        throw new Error(
            "선택한 모델 공간의 실종 임베딩이 없습니다: " +
            `model=${modelVersionKey}, ` +
            `space=${embeddingSpace.space_key}`
        )
    }

    console.log(
        `\n실종공고: ${lostPostId}`
    )

    console.log(
        `모델 버전: ${modelVersionKey}`
    )

    console.log(
        `임베딩 공간: ${embeddingSpace.space_key}`
    )

    console.log(
        `사용 임베딩: ${vectors.length}장`
    )

    console.log(
        `species: ${species}`
    )

    console.log(
        `정답 동물: ${targetAnimalId}`
    )

    console.log(
        `방법1 가점: ${repeatBonus}\n`
    )

    const perVectorCandidates = []

    for (
        let index = 0;
        index < vectors.length;
        index += 1
    ) {
        const rawCandidates =
            await findNearestCandidates(
                vectors[index],
                species,
                embeddingSpace.id,
                CANDIDATE_LIMIT_PER_VECTOR
            )

        const candidates =
            dedupeCandidates(
                rawCandidates
            )

        perVectorCandidates.push(
            candidates
        )

        const target =
            candidates.find(
                (candidate) =>
                    candidate.source_type ===
                        "rescue" &&
                    candidate.ref_id ===
                        targetAnimalId
            )

        const targetRank =
            target
                ? candidates.findIndex(
                    (candidate) =>
                        keyOf(candidate) ===
                        keyOf(target)
                ) + 1
                : null

        console.log(
            `[실종사진 ${index + 1}]`
        )

        console.log(
            "정답 순위:",
            targetRank ?? "후보 없음"
        )

        console.log(
            "정답 유사도:",
            target
                ? target.similarity
                : "-"
        )

        console.log("")
    }

    const baseline =
        baselineRanking(
            perVectorCandidates
        )

    const method1 =
        repeatBonusRanking(
            perVectorCandidates,
            repeatBonus,
            repeatTopN
        )
    
    console.log(`방법1 반복 인정 범위: Top ${repeatTopN}\n`)

    const method3 =
        rankPointRanking(
            perVectorCandidates
        )

    console.log(
        "=============================="
    )

    console.log(
        "기존 방식"
    )

    console.log(
        findTarget(
            baseline,
            targetAnimalId
        )
    )

    console.log(
        "=============================="
    )

    console.log(
        "방법 1 - 반복 등장 가점"
    )

    console.log(
        findTarget(
            method1,
            targetAnimalId
        )
    )

    console.log(
        "=============================="
    )

    console.log(
        "방법 3 - 순위 점수 합산"
    )

    console.log(
        findTarget(
            method3,
            targetAnimalId
        )
    )

    console.log(
        "==============================\n"
    )

    console.log(
        "[기존 방식 TOP 10]"
    )

    console.table(
        baseline.slice(0, 10)
    )

    console.log(
        "[방법 1 TOP 10]"
    )

    console.table(
        method1.slice(0, 10)
    )

    console.log(
        "[방법 3 TOP 10]"
    )

    console.table(
        method3.slice(0, 10)
    )
}

main()
    .catch((error) => {
        console.error(error)
        process.exitCode = 1
    })
    .finally(async () => {
        await pool.end()
    })