import {
    findLostPostEmbeddings,
    findLostPostSpecies,
    findNearestCandidates
} from "../src/modules/matches/matches.repository.js"

import { pool } from "../src/db/pool.js"

const lostPostId = Number(process.argv[2])
const targetAnimalId = Number(process.argv[3])
const repeatBonus = Number(process.argv[4] ?? 0.05)

const CANDIDATE_LIMIT_PER_VECTOR = 100
const RANK_POINT_LIMIT = 10

if (
    !Number.isInteger(lostPostId) ||
    !Number.isInteger(targetAnimalId)
) {
    console.error(
        "사용법: node compareMatchStrategies.mjs <lostPostId> <targetAnimalId> [repeatBonus]"
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
    bonus
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
                        hit_count: 1
                    }
                )

                continue
            }

            current.hit_count += 1

            current.max_similarity =
                Math.max(
                    current.max_similarity,
                    candidate.similarity
                )
        }
    }

    return [...aggregated.values()]
        .map((candidate) => {
            const repeatCount =
                Math.max(
                    candidate.hit_count - 1,
                    0
                )

            const rankingScore =
                candidate.max_similarity +
                repeatCount * bonus

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
                    repeatCount * bonus,
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
    const vectors =
        await findLostPostEmbeddings(
            lostPostId
        )

    const species =
        await findLostPostSpecies(
            lostPostId
        )

    console.log(
        `\n실종공고: ${lostPostId}`
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
            repeatBonus
        )

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