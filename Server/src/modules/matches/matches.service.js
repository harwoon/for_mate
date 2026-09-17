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
        throw invalidQuery("sex는 M, F, U 중 하나여야 합니다.", "INVALID_SEX")
    }
    if (neuter && !["Y", "N", "U"].includes(neuter)) {
        throw invalidQuery("neuter는 Y, N, U 중 하나여야 합니다.", "INVALID_NEUTER")
    }
    if (!MATCH_SORTS.has(sort)) {
        throw invalidQuery("지원하지 않는 정렬 방식입니다.", "INVALID_SORT")
    }
    if (startDate && endDate && startDate > endDate) {
        throw invalidQuery("시작일은 종료일보다 늦을 수 없습니다.", "INVALID_DATE_RANGE")
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
    return Number.isFinite(timestamp) ? timestamp : null
}

function compareDates(a, b, direction) {
    const aDate = dateValue(a)
    const bDate = dateValue(b)
    if (aDate === null && bDate === null) return 0
    if (aDate === null) return 1
    if (bDate === null) return -1
    return direction === "desc" ? bDate - aDate : aDate - bDate
}

function sortCandidates(candidates, sort) {
    return candidates.sort((a, b) => {
        let primary = 0
        if (sort === "happen_date_desc") {
            primary = compareDates(a.happen_dt, b.happen_dt, "desc")
        } else if (sort === "happen_date_asc") {
            primary = compareDates(a.happen_dt, b.happen_dt, "asc")
        } else if (sort === "notice_end_asc") {
            primary = compareDates(a.notice_edt, b.notice_edt, "asc")
        } else {
            primary = b.similarity - a.similarity
        }

        if (primary !== 0) return primary
        const similarityOrder = b.similarity - a.similarity
        if (similarityOrder !== 0) return similarityOrder
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
export async function getMatches(lostPostId, userId, rawOptions) {
    if (!Number.isInteger(lostPostId) || lostPostId <= 0) {
        throw Object.assign(
            new Error("공고 ID가 올바르지 않습니다."),
            {
                status: 400,
                code: "INVALID_POST_ID"
            }
        )
    }

    const { limit, sort, filters } = parseMatchOptions(rawOptions)

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

    const species = await repository.findLostPostSpecies(
        lostPostId
    )

    if (
        species !== "개" &&
        species !== "고양이"
    ) {
        const error = new Error(
            "지원하지 않는 동물 종입니다."
        )

        error.status = 400
        error.code = "UNSUPPORTED_SPECIES"

        throw error
    }

    const activeModels =
        await repository.findActiveModelVersions()

    if (activeModels.length === 0) {
        const error = new Error(
            "활성화된 임베딩 모델이 없습니다."
        )

        error.status = 503
        error.code = "ACTIVE_MODEL_NOT_FOUND"

        throw error
    }

    if (activeModels.length > 1) {
        const error = new Error(
            "활성화된 임베딩 모델이 여러 개입니다."
        )

        error.status = 500
        error.code = "MULTIPLE_ACTIVE_MODELS"

        throw error
    }

    const activeModel = activeModels[0]

    const embeddingSpaces =
        await repository.findEmbeddingSpace(
            activeModel.version_key,
            species
        )

    if (embeddingSpaces.length === 0) {
        const error = new Error(
            "사용 가능한 임베딩 공간이 없습니다."
        )

        error.status = 503
        error.code = "EMBEDDING_SPACE_NOT_FOUND"

        throw error
    }

    if (embeddingSpaces.length > 1) {
        const error = new Error(
            "사용 가능한 임베딩 공간이 여러 개입니다."
        )

        error.status = 500
        error.code = "MULTIPLE_EMBEDDING_SPACES"

        throw error
    }

    const embeddingSpace = embeddingSpaces[0]

    const vectors =
        await repository.findLostPostEmbeddings(
            lostPostId,
            embeddingSpace.id
        )

    if (vectors.length === 0) {
        const error = new Error(
            "현재 모델의 이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
        )

        error.status = 409
        error.code = "EMBEDDINGS_NOT_READY"

        throw error
    }

    // 같은 동물이 여러 사진에서 후보로 잡힐 수 있으므로
    // source_type + 동물 ID 기준으로 하나만 유지
    const bestByAnimal = new Map()

    for (const vector of vectors) {
        const candidates = await repository.findNearestCandidates(
            vector,
            species,
            embeddingSpace.id,
            CANDIDATE_LIMIT_PER_VECTOR,
            filters,
            post.event_date
        )

        for (const {
            ref_id,
            source_type,
            distance,
            happen_dt,
            notice_edt
        } of candidates) {
            const key = `${source_type}:${ref_id}`
            const current = bestByAnimal.get(key)

            // 동일 개체의 여러 이미지 중 가장 가까운 거리 사용
            if (
                current === undefined ||
                distance < current.distance
            ) {
                bestByAnimal.set(key, {
                    distance,
                    source_type,
                    ref_id: Number(ref_id),
                    happen_dt,
                    notice_edt
                })
            }
        }
    }

    // 전체 후보를 유사도 순으로 정렬
    const rankedAll = sortCandidates(
        [...bestByAnimal.values()]
        .map(({ source_type, ref_id, distance, happen_dt, notice_edt }) => ({
            source_type,
            ref_id,
            desertion_no:
                source_type === "rescue"
                    ? ref_id
                    : null,
            pawinhand_animal_id:
                source_type === "pawinhand"
                    ? ref_id
                    : null,
            similarity: 1 - distance,
            happen_dt,
            notice_edt
        })),
        sort
    )

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
            has_more: false,
            total: 0
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
