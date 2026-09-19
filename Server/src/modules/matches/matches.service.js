import * as repository from "./matches.repository.js"
import { findById as findLostPostById } from "../lost-posts/lost-posts.repository.js"

// 실종동물 사진 1장마다 조회할 후보 이미지 수
// 최종 결과는 최대 50마리지만 같은 동물의 이미지가 여러 장 존재함
// 최종 개체 수보다 넓은 후보 풀을 확보
const CANDIDATE_LIMIT_PER_VECTOR = 100

// 최초 매칭 결과는 8개까지 보여줌
const DEFAULT_RESULT_LIMIT = 8

// 사용자가 추가로 확인할 수 있는 최대 순위
const MAX_RESULT_LIMIT = 50

// 실종사진별 반복 등장 여부를 판단할 후보 범위
const REPEAT_TOP_N = 20

// 종별 반복 등장 가점
const REPEAT_BONUS_BY_SPECIES = {
    개: 0.03,
    고양이: 0
}

const MATCH_SORTS = new Set([
    "similarity_desc",
    "happen_date_desc",
    "happen_date_asc",
    "notice_end_asc"
])

function invalidQuery(message, code) {
    const error = new Error(message)
    error.status = 400
    error.code = code
    return error
}

function parseDate(value, field) {
    if (!value) return null
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
        throw invalidQuery(`${field}는 YYYY-MM-DD 형식이어야 합니다.`, "INVALID_DATE")
    }
    return value
}

function parseMatchOptions(rawOptions) {
    const options = rawOptions && typeof rawOptions === "object"
        ? rawOptions
        : { limit: rawOptions }

    const sex = options.sex || null
    const neuter = options.neuter || null
    const sort = options.sort || "similarity_desc"
    const startDate = parseDate(options.start_date, "start_date")
    const endDate = parseDate(options.end_date, "end_date")

    if (sex && !["M", "F", "U"].includes(sex)) {
        throw invalidQuery(
            "sex는 M, F, U 중 하나여야 합니다.",
            "INVALID_SEX"
        )
    }

    if (neuter && !["Y", "N", "U"].includes(neuter)) {
        throw invalidQuery(
            "neuter는 Y, N, U 중 하나여야 합니다.",
            "INVALID_NEUTER"
        )
    }

    if (!MATCH_SORTS.has(sort)) {
        throw invalidQuery(
            "지원하지 않는 정렬 방식입니다.",
            "INVALID_SORT"
        )
    }

    if (startDate && endDate && startDate > endDate) {
        throw invalidQuery(
            "시작일은 종료일보다 늦을 수 없습니다.",
            "INVALID_DATE_RANGE"
        )
    }

    return {
        limit: parseResultLimit(options.limit),
        sort,
        filters: {
            sex,
            neuter,
            sido: String(options.sido || "").trim() || null,
            sigungu: String(options.sigungu || "").trim() || null,
            start_date: startDate,
            end_date: endDate
        }
    }
}

function dateValue(value) {
    if (!value) return null

    const timestamp = new Date(value).getTime()

    return Number.isFinite(timestamp)
        ? timestamp
        : null
}

function compareDates(a, b, direction) {
    const aDate = dateValue(a)
    const bDate = dateValue(b)

    if (aDate === null && bDate === null) return 0
    if (aDate === null) return 1
    if (bDate === null) return -1

    return direction === "desc"
        ? bDate - aDate
        : aDate - bDate
}

function sortCandidates(candidates, sort) {
    return candidates.sort((a, b) => {
        let primary = 0

        if (sort === "happen_date_desc") {
            primary = compareDates(
                a.happen_dt,
                b.happen_dt,
                "desc"
            )
        } else if (sort === "happen_date_asc") {
            primary = compareDates(
                a.happen_dt,
                b.happen_dt,
                "asc"
            )
        } else if (sort === "notice_end_asc") {
            primary = compareDates(
                a.notice_edt,
                b.notice_edt,
                "asc"
            )
        } else {
            primary =
                b.ranking_score -
                a.ranking_score
        }

        if (primary !== 0) {
            return primary
        }

        const similarityOrder =
            b.similarity -
            a.similarity

        if (similarityOrder !== 0) {
            return similarityOrder
        }

        return b.ref_id - a.ref_id
    })
}

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
export async function getMatches(
    lostPostId,
    userId,
    rawOptions
) {
    if (
        !Number.isInteger(lostPostId) ||
        lostPostId <= 0
    ) {
        throw Object.assign(
            new Error(
                "공고 ID가 올바르지 않습니다."
            ),
            {
                status: 400,
                code: "INVALID_POST_ID"
            }
        )
    }

    const {
        limit,
        sort,
        filters
    } = parseMatchOptions(rawOptions)

    const post =
        await findLostPostById(
            lostPostId
        )

    if (!post) {
        throw Object.assign(
            new Error(
                "실종 공고를 찾을 수 없습니다."
            ),
            {
                status: 404,
                code: "LOST_POST_NOT_FOUND"
            }
        )
    }

    if (
        userId == null ||
        String(post.user_id) !==
        String(userId)
    ) {
        throw Object.assign(
            new Error(
                "접근 권한이 없습니다."
            ),
            {
                status: 403,
                code: "FORBIDDEN"
            }
        )
    }

    const species =
        await repository.findLostPostSpecies(
            lostPostId
        )
    
    const repeatBonus = REPEAT_BONUS_BY_SPECIES[species] ?? 0

    if (
        species !== "개" &&
        species !== "고양이"
    ) {
        const error =
            new Error(
                "지원하지 않는 동물 종입니다."
            )

        error.status = 400
        error.code =
            "UNSUPPORTED_SPECIES"

        throw error
    }

    const activeModels =
        await repository.findActiveModelVersions()

    if (activeModels.length === 0) {
        const error =
            new Error(
                "활성화된 임베딩 모델이 없습니다."
            )

        error.status = 503
        error.code =
            "ACTIVE_MODEL_NOT_FOUND"

        throw error
    }

    if (activeModels.length > 1) {
        const error =
            new Error(
                "활성화된 임베딩 모델이 여러 개입니다."
            )

        error.status = 500
        error.code =
            "MULTIPLE_ACTIVE_MODELS"

        throw error
    }

    const activeModel =
        activeModels[0]

    const embeddingSpaces =
        await repository.findEmbeddingSpace(
            activeModel.version_key,
            species
        )

    if (
        embeddingSpaces.length === 0
    ) {
        const error =
            new Error(
                "사용 가능한 임베딩 공간이 없습니다."
            )

        error.status = 503
        error.code =
            "EMBEDDING_SPACE_NOT_FOUND"

        throw error
    }

    if (
        embeddingSpaces.length > 1
    ) {
        const error =
            new Error(
                "사용 가능한 임베딩 공간이 여러 개입니다."
            )

        error.status = 500
        error.code =
            "MULTIPLE_EMBEDDING_SPACES"

        throw error
    }

    const embeddingSpace =
        embeddingSpaces[0]

    const similarImagesConfirmed =
        String(
            rawOptions?.confirm_similar_images
        ).toLowerCase() === "true"

    if (!similarImagesConfirmed) {
        const closestImagePair =
            await repository.findClosestLostPostImagePair(
                lostPostId,
                embeddingSpace.id
            )

        const similarity =
            closestImagePair
                ? 1 - Number(
                    closestImagePair.distance
                )
                : null

        if (
            similarity !== null &&
            similarity >= 0.97
        ) {
            const error =
                new Error(
                    "유사하거나 동일한 사진이 포함되어 있어 AI 매칭 정확도가 낮아질 수 있습니다. 그래도 매칭을 진행하시겠습니까?"
                )

            error.status = 409
            error.code =
                "SIMILAR_LOST_POST_IMAGES"

            throw error
        }
    }

    const vectors =
        await repository.findLostPostEmbeddings(
            lostPostId,
            embeddingSpace.id
        )

    if (vectors.length === 0) {
        const error =
            new Error(
                "현재 모델의 이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
            )

        error.status = 409
        error.code =
            "EMBEDDINGS_NOT_READY"

        throw error
    }

    const bestByAnimal = new Map()

    for (const vector of vectors) {
        const candidates =
            await repository.findNearestCandidates(
                vector,
                species,
                embeddingSpace.id,
                CANDIDATE_LIMIT_PER_VECTOR,
                filters,
                post.event_date
            )

        // 한 실종사진 안에서 같은 동물의 이미지가 여러 장 잡혀도
        // 가장 높은 유사도 1개만 사용
        const bestForVector = new Map()

        for (const {
            ref_id,
            source_type,
            distance,
            happen_dt,
            notice_edt
        } of candidates) {
            const key = `${source_type}:${ref_id}`
            const current = bestForVector.get(key)

            if (
                current === undefined ||
                distance < current.distance
            ) {
                bestForVector.set(key, {
                    distance,
                    source_type,
                    ref_id: Number(ref_id),
                    happen_dt,
                    notice_edt
                })
            }
        }

        const vectorCandidates =
            [...bestForVector.values()]

        // 반복 등장 횟수는 실종사진별 Top20 후보만 계산
        const repeatTopKeys = new Set(
            [...vectorCandidates]
                .sort((a, b) => a.distance - b.distance)
                .slice(0, REPEAT_TOP_N)
                .map(
                    (candidate) =>
                        `${candidate.source_type}:${candidate.ref_id}`
                )
        )

        // 최종 후보 풀에는 Top20 밖 후보도 유지
        for (const candidate of vectorCandidates) {
            const key =
                `${candidate.source_type}:${candidate.ref_id}`

            let current =
                bestByAnimal.get(key)

            if (!current) {
                current = {
                    ...candidate,
                    appeared_count: 0
                }

                bestByAnimal.set(
                    key,
                    current
                )
            } else if (
                candidate.distance <
                current.distance
            ) {
                // 여러 실종사진 중 최고 유사도 유지
                current.distance =
                    candidate.distance

                current.happen_dt =
                    candidate.happen_dt

                current.notice_edt =
                    candidate.notice_edt
            }

            // Top20에 포함된 경우에만 반복 횟수 증가
            if (repeatTopKeys.has(key)) {
                current.appeared_count += 1
            }
        }
    }

    // 최고 유사도 + 반복 등장 가점으로
    // 정렬용 ranking_score 계산
    const rankedAll =
        sortCandidates(
            [...bestByAnimal.values()]
                .map(({
                    source_type,
                    ref_id,
                    distance,
                    happen_dt,
                    notice_edt,
                    appeared_count
                }) => {
                    const similarity =
                        1 - distance

                    const ranking_score =
                        similarity +
                        (
                            Math.max(
                                appeared_count - 1,
                                0
                            ) *
                            repeatBonus
                        )

                    return {
                        source_type,
                        ref_id,

                        desertion_no:
                            source_type ===
                            "rescue"
                                ? ref_id
                                : null,

                        pawinhand_animal_id:
                            source_type ===
                            "pawinhand"
                                ? ref_id
                                : null,

                        found_post_id:
                            source_type ===
                            "found"
                                ? ref_id
                                : null,

                        // 화면과 DB에는
                        // 실제 유사도 유지
                        similarity,

                        // 정렬에만 사용하는 후처리 점수
                        ranking_score,

                        appeared_count,
                        happen_dt,
                        notice_edt
                    }
                }),
            sort
        )

    // 최초 8개,
    // 더 보기 시 요청 limit까지 사용
    const ranked =
        rankedAll.slice(
            0,
            limit
        )

    if (ranked.length === 0) {
        return {
            items: [],
            limit,
            max_limit:
                MAX_RESULT_LIMIT,
            has_more: false,
            total: 0
        }
    }

    // 실제 사용자에게 노출되는 후보까지만
    // matches 테이블에 저장
    const savedMatches =
        await repository.upsertMatches(
            lostPostId,
            ranked.map(
                (result) => ({
                    source_type:
                        result.source_type,
                    ref_id:
                        result.ref_id,

                    // 가점이 아닌
                    // 실제 유사도 저장
                    similarity:
                        result.similarity
                })
            )
        )

    const candidates =
        await repository.findMatchCandidates(
            savedMatches.map(
                (match) =>
                    match.id
            )
        )

    const candidatesById =
        new Map(
            candidates.map(
                (candidate) => [
                    candidate.match_id,
                    candidate
                ]
            )
        )

    const items =
        ranked.map(
            (result, index) => ({
                ...candidatesById.get(
                    savedMatches[index].id
                ),
                match_id:
                    savedMatches[index].id,
                ...result,
                rank: index + 1
            })
        )

    return {
        items,
        limit,
        max_limit:
            MAX_RESULT_LIMIT,
        total: rankedAll.length,
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

function compareBreed(
    lostBreed,
    rescueKindNm
) {
    if (
        !lostBreed ||
        !rescueKindNm
    ) {
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
                rescueKindNm
                    .replace(/\s/g, "")
            ) ||
        rescueKindNm
            .replace(/\s/g, "")
            .includes(
                lostBreed
                    .replace(/\s/g, "")
            )

    return {
        label: "품종",
        lost: lostBreed,
        rescue: rescueKindNm,
        status:
            isMatch
                ? "match"
                : "mismatch"
    }
}

function compareSex(
    lostSex,
    rescueSexCd
) {
    if (
        !lostSex ||
        lostSex === "Q" ||
        !rescueSexCd ||
        rescueSexCd === "Q"
    ) {
        return {
            label: "성별",
            lost:
                SEX_LABEL[lostSex] ??
                "미상",
            rescue:
                SEX_LABEL[
                    rescueSexCd
                ] ?? "미상",
            status: "unknown"
        }
    }

    return {
        label: "성별",
        lost:
            SEX_LABEL[lostSex],
        rescue:
            SEX_LABEL[rescueSexCd],
        status:
            lostSex ===
            rescueSexCd
                ? "match"
                : "mismatch"
    }
}

function compareColor(
    lostColor,
    rescueColorTags
) {
    if (
        !lostColor ||
        !rescueColorTags ||
        rescueColorTags.length === 0
    ) {
        return {
            label: "색상",
            lost: lostColor,
            rescue:
                rescueColorTags
                    ?.join(", "),
            status: "unknown"
        }
    }

    const isMatch =
        rescueColorTags.some(
            (tag) =>
                tag.includes(
                    lostColor
                ) ||
                lostColor.includes(
                    tag
                )
        )

    return {
        label: "색상",
        lost: lostColor,
        rescue:
            rescueColorTags
                .join(", "),
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
        [
            regionSido,
            regionSigungu
        ]
            .filter(Boolean)
            .join(" ") ||
        happenPlace

    if (
        !lostRegion ||
        !rescueRegion
    ) {
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
            lostRegion.includes(
                regionSido
            )
        ) ||
        (
            regionSigungu &&
            lostRegion.includes(
                regionSigungu
            )
        ) ||
        (
            !regionSido &&
            !regionSigungu &&
            happenPlace &&
            (
                lostRegion.includes(
                    happenPlace
                ) ||
                happenPlace.includes(
                    lostRegion
                )
            )
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

function compareDate(
    eventDate,
    happenDt
) {
    if (
        !eventDate ||
        !happenDt
    ) {
        return {
            label: "날짜",
            lost: eventDate,
            rescue: happenDt,
            status: "unknown"
        }
    }

    const diffDays =
        Math.round(
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
        diffDays <=
        DATE_PLAUSIBLE_DAYS

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

export async function getMatchDetail(
    matchId,
    userId
) {
    const row =
        await repository.findMatchById(
            matchId
        )

    if (!row) {
        const error =
            new Error(
                "매칭 결과를 찾을 수 없습니다."
            )

        error.status = 404
        error.code =
            "MATCH_NOT_FOUND"

        throw error
    }

    if (
        String(
            row.lost_post_owner_id
        ) !==
        String(userId)
    ) {
        const error =
            new Error(
                "접근 권한이 없습니다."
            )

        error.status = 403
        error.code = "FORBIDDEN"

        throw error
    }

    return {
        similarity_score:
            row.similarity_score,

        lost_post: {
            id:
                row.lost_post_id,
            pet_name:
                row.pet_name,
            species:
                row.species
        },

        animal: {
            source_type:
                row.source_type,
            id:
                Number(
                    row.animal_ref_id
                ),
            up_kind_nm:
                row.up_kind_nm
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