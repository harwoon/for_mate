import * as repository from "./matches.repository.js"
import { findById as findLostPostById } from "../lost-posts/lost-posts.repository.js"

// 실종동물 사진 1장마다 조회할 후보 이미지 수
// 최종 결과는 최대 50마리지만 같은 동물의 이미지가 여러 장 존재함
// 최종 개체 수보다 넓은 후보 풀을 확보
const CANDIDATE_LIMIT_PER_VECTOR = 100

// 최초 매칭 결과는 10위까지 보여줌
const DEFAULT_RESULT_LIMIT = 8

// 사용자가 추가로 확인할 수 있는 최대 순위
const MAX_RESULT_LIMIT = 50

// 반복 등장 1회당 정렬용 가점
// similarity는 0~1 범위이므로 0.05 = 5%p
// 실험하면서 값을 변경해 비교할 예정
const REPEAT_BONUS = 0.05

// 실종사진별 상위 10개 후보만 반복 등장으로 인정
const REPEAT_TOP_N = 10

function parseResultLimit(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return DEFAULT_RESULT_LIMIT
    }

    const limit = Number(value)

    if (
        !Number.isInteger(limit) ||
        limit <= 0 ||
        limit > MAX_RESULT_LIMIT
    ) {
        const error = new Error(
            `limit은 1 이상 ${MAX_RESULT_LIMIT} 이하의 정수여야 합니다.`
        )

        error.status = 400
        error.code = "INVALID_LIMIT"

        throw error
    }

    return limit
}

// 캐시 조회가 아니라 요청마다 실시간으로 계산
export async function getMatches(lostPostId, userId, rawLimit) {
    if (!Number.isInteger(lostPostId) || lostPostId <= 0) {
        throw Object.assign(
            new Error("공고 ID가 올바르지 않습니다."),
            {
                status: 400,
                code: "INVALID_POST_ID"
            }
        )
    }

    const limit = parseResultLimit(rawLimit)

    const post = await findLostPostById(lostPostId)

    if (!post) {
        throw Object.assign(
            new Error("실종 공고를 찾을 수 없습니다."),
            {
                status: 404,
                code: "LOST_POST_NOT_FOUND"
            }
        )
    }

    if (
        userId == null ||
        String(post.user_id) !== String(userId)
    ) {
        throw Object.assign(
            new Error("접근 권한이 없습니다."),
            {
                status: 403,
                code: "FORBIDDEN"
            }
        )
    }

    const vectors = await repository.findLostPostEmbeddings(
        lostPostId
    )

    if (vectors.length === 0) {
        const error = new Error(
            "이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
        )

        error.status = 409
        error.code = "EMBEDDINGS_NOT_READY"

        throw error
    }

    const species = await repository.findLostPostSpecies(
        lostPostId
    )

    // 여러 실종사진에서 같은 동물이 반복 등장한 횟수와
    // 최고 유사도를 함께 집계
    const aggregatedByAnimal = new Map()

    for (const vector of vectors) {
        const candidates = await repository.findNearestCandidates(
            vector,
            species,
            CANDIDATE_LIMIT_PER_VECTOR
        )

        // 같은 실종사진 한 장에서 동일 동물의 이미지가
        // 여러 장 후보로 잡힐 수 있으므로 개체별 최고 유사도만 사용
        const bestForVector = new Map()

        for (const {
            ref_id,
            source_type,
            distance
        } of candidates) {
            const key = `${source_type}:${ref_id}`
            const similarity = 1 - Number(distance)
            const current = bestForVector.get(key)

            if (
                current === undefined ||
                similarity > current.similarity
            ) {
                bestForVector.set(key, {
                    source_type,
                    ref_id: Number(ref_id),
                    similarity
                })
            }
        }

        // 한 실종사진에서 개체별 최고 유사도 기준으로 정렬
        const vectorCandidates = [
            ...bestForVector.values()
        ].sort(
            (a, b) =>
                b.similarity - a.similarity
        )

        // 전체 후보의 최고 유사도는 유지
        for (const candidate of vectorCandidates) {
            const key =
                `${candidate.source_type}:${candidate.ref_id}`

            const current =
                aggregatedByAnimal.get(key)

            if (current === undefined) {
                aggregatedByAnimal.set(key, {
                    source_type:
                        candidate.source_type,
                    ref_id:
                        candidate.ref_id,
                    max_similarity:
                        candidate.similarity,
                    hit_count: 0
                })

                continue
            }

            current.max_similarity = Math.max(
                current.max_similarity,
                candidate.similarity
            )
        }

        // 반복 가점은 실종사진별 Top 10 후보에게만 적용
        for (
            const candidate of
            vectorCandidates.slice(0, REPEAT_TOP_N)
        ) {
            const key =
                `${candidate.source_type}:${candidate.ref_id}`

            const current =
                aggregatedByAnimal.get(key)

            current.hit_count += 1
        }
    }

    // 방법 1:
    // 최고 유사도 + 반복 등장 횟수에 따른 가점
    const rankedAll = [...aggregatedByAnimal.values()]
        .map((candidate) => {
            // 최초 등장은 반복으로 보지 않음
            // 3장의 사진에서 등장했다면 반복 횟수는 2회
            const repeatCount = Math.max(
                candidate.hit_count - 1,
                0
            )

            const repeatBonus =
                repeatCount * REPEAT_BONUS

            return {
                source_type: candidate.source_type,

                desertion_no:
                    candidate.source_type === "rescue"
                        ? candidate.ref_id
                        : null,

                pawinhand_animal_id:
                    candidate.source_type === "pawinhand"
                        ? candidate.ref_id
                        : null,

                // 실제 사용자에게 보여줄 원본 최고 유사도
                similarity: candidate.max_similarity,

                // 실험 결과 확인용
                hit_count: candidate.hit_count,
                repeat_count: repeatCount,
                repeat_bonus: repeatBonus,

                // 정렬에만 사용하는 점수
                ranking_score:
                    candidate.max_similarity +
                    repeatBonus
            }
        })
        .sort((a, b) => {
            if (b.ranking_score !== a.ranking_score) {
                return b.ranking_score - a.ranking_score
            }

            return b.similarity - a.similarity
        })
        

    // 최초 10개, 더 보기 시 20 / 30 / 40 / 50개까지 사용
    const ranked = rankedAll.slice(
        0,
        limit
    )

    if (ranked.length === 0) {
        return {
            items: [],
            limit,
            max_limit: MAX_RESULT_LIMIT,
            has_more: false
        }
    }

    // 실제 사용자에게 노출되는 후보까지만 matches 테이블에 저장
    const savedMatches = await repository.upsertMatches(
        lostPostId,
        ranked.map((result) => ({
            source_type: result.source_type,
            ref_id:
                result.source_type === "rescue"
                    ? result.desertion_no
                    : result.pawinhand_animal_id,
            similarity: result.similarity
        }))
    )

    const candidates = await repository.findMatchCandidates(
        savedMatches.map((match) => match.id)
    )

    const candidatesById = new Map(
        candidates.map((candidate) => [
            candidate.match_id,
            candidate
        ])
    )

    const items = ranked.map((result, index) => ({
        ...candidatesById.get(savedMatches[index].id),
        match_id: savedMatches[index].id,
        ...result,
        rank: index + 1
    }))

    return {
        items,
        limit,
        max_limit: MAX_RESULT_LIMIT,
        has_more:
            limit < MAX_RESULT_LIMIT &&
            rankedAll.length > limit
    }
}

// 매칭 상세 조회

const SEX_LABEL = {
    M: "수컷",
    F: "암컷",
    Q: "미상",
    U: "미상"
}

const DATE_PLAUSIBLE_DAYS = 60

function compareBreed(lostBreed, rescueKindNm) {
    if (!lostBreed || !rescueKindNm) {
        return {
            label: "품종",
            lost: lostBreed,
            rescue: rescueKindNm,
            status: "unknown"
        }
    }

    const isMatch =
        lostBreed
            .replace(/\s/g, "")
            .includes(
                rescueKindNm.replace(/\s/g, "")
            ) ||
        rescueKindNm
            .replace(/\s/g, "")
            .includes(
                lostBreed.replace(/\s/g, "")
            )

    return {
        label: "품종",
        lost: lostBreed,
        rescue: rescueKindNm,
        status: isMatch ? "match" : "mismatch"
    }
}

function compareSex(lostSex, rescueSexCd) {
    if (
        !lostSex ||
        lostSex === "Q" ||
        !rescueSexCd ||
        rescueSexCd === "Q"
    ) {
        return {
            label: "성별",
            lost: SEX_LABEL[lostSex] ?? "미상",
            rescue: SEX_LABEL[rescueSexCd] ?? "미상",
            status: "unknown"
        }
    }

    return {
        label: "성별",
        lost: SEX_LABEL[lostSex],
        rescue: SEX_LABEL[rescueSexCd],
        status:
            lostSex === rescueSexCd
                ? "match"
                : "mismatch"
    }
}

function compareColor(lostColor, rescueColorTags) {
    if (
        !lostColor ||
        !rescueColorTags ||
        rescueColorTags.length === 0
    ) {
        return {
            label: "색상",
            lost: lostColor,
            rescue: rescueColorTags?.join(", "),
            status: "unknown"
        }
    }

    const isMatch = rescueColorTags.some(
        (tag) =>
            tag.includes(lostColor) ||
            lostColor.includes(tag)
    )

    return {
        label: "색상",
        lost: lostColor,
        rescue: rescueColorTags.join(", "),
        status:
            isMatch
                ? "match"
                : "mismatch"
    }
}

function compareRegion(
    lostRegion,
    regionSido,
    regionSigungu,
    happenPlace
) {
    const rescueRegion =
        [regionSido, regionSigungu]
            .filter(Boolean)
            .join(" ") ||
        happenPlace

    if (!lostRegion || !rescueRegion) {
        return {
            label: "지역",
            lost: lostRegion,
            rescue: rescueRegion,
            status: "unknown"
        }
    }

    const isMatch =
        (
            regionSido &&
            lostRegion.includes(regionSido)
        ) ||
        (
            regionSigungu &&
            lostRegion.includes(regionSigungu)
        )

    return {
        label: "지역",
        lost: lostRegion,
        rescue: rescueRegion,
        status:
            isMatch
                ? "match"
                : "mismatch"
    }
}

function compareDate(eventDate, happenDt) {
    if (!eventDate || !happenDt) {
        return {
            label: "날짜",
            lost: eventDate,
            rescue: happenDt,
            status: "unknown"
        }
    }

    const diffDays = Math.round(
        (
            new Date(happenDt) -
            new Date(eventDate)
        ) /
        (
            1000 *
            60 *
            60 *
            24
        )
    )

    const isPlausible =
        diffDays >= 0 &&
        diffDays <= DATE_PLAUSIBLE_DAYS

    return {
        label: "날짜",
        lost: eventDate,
        rescue: happenDt,
        diffDays,
        status:
            isPlausible
                ? "match"
                : "mismatch"
    }
}

export async function getMatchDetail(matchId, userId) {
    const row = await repository.findMatchById(
        matchId
    )

    if (!row) {
        const error = new Error(
            "매칭 결과를 찾을 수 없습니다."
        )

        error.status = 404
        error.code = "MATCH_NOT_FOUND"

        throw error
    }

    if (
        String(row.lost_post_owner_id) !==
        String(userId)
    ) {
        const error = new Error(
            "접근 권한이 없습니다."
        )

        error.status = 403
        error.code = "FORBIDDEN"

        throw error
    }

    return {
        similarity_score: row.similarity_score,
        lost_post: {
            id: row.lost_post_id,
            pet_name: row.pet_name,
            species: row.species
        },
        animal: {
            source_type: row.source_type,
            id: Number(row.animal_ref_id),
            up_kind_nm: row.up_kind_nm
        },
        comparison: [
            compareBreed(
                row.breed,
                row.kind_nm
            ),
            compareSex(
                row.sex,
                row.sex_cd
            ),
            compareColor(
                row.color,
                row.color_tags
            ),
            compareRegion(
                row.region,
                row.region_sido,
                row.region_sigungu,
                row.happen_place
            ),
            compareDate(
                row.event_date,
                row.happen_dt
            )
        ]
    }
}