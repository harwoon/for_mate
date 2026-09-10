import * as repository from "./matches.repository.js"
import { findById as findLostPostById } from "../lost-posts/lost-posts.repository.js"

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.

const CANDIDATE_LIMIT_PER_VECTOR = 20
const RESULT_LIMIT = 10

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.
// 캐시 조회가 아니라 요청마다 실시간으로 계산한다.
export async function getMatches(lostPostId, userId) {
    if (!Number.isInteger(lostPostId) || lostPostId <= 0) {
        throw Object.assign(new Error("공고 ID가 올바르지 않습니다."), { status: 400, code: "INVALID_POST_ID" })
    }

    const post = await findLostPostById(lostPostId)
    if (!post) {
        throw Object.assign(new Error("실종 공고를 찾을 수 없습니다."), { status: 404, code: "LOST_POST_NOT_FOUND" })
    }
    if (userId == null || String(post.user_id) !== String(userId)) {
        throw Object.assign(new Error("접근 권한이 없습니다."), { status: 403, code: "FORBIDDEN" })
    }

    const vectors = await repository.findLostPostEmbeddings(lostPostId)

    if (vectors.length === 0) {
        const error = new Error("이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
        error.status = 409
        error.code = "EMBEDDINGS_NOT_READY"
        throw error
    }

    const species = await repository.findLostPostSpecies(lostPostId)

    const bestByAnimal = new Map() // key: `${source_type}:${ref_id}`

    for (const vector of vectors) {
        const candidates = await repository.findNearestCandidates(
            vector,
            species,
            CANDIDATE_LIMIT_PER_VECTOR
        )

        for (const { ref_id, source_type, distance } of candidates) {
            const key = `${source_type}:${ref_id}`
            const current = bestByAnimal.get(key)

            if (current === undefined || distance < current.distance) {
                bestByAnimal.set(key, { distance, source_type, ref_id: Number(ref_id) })
            }
        }
    }

    const ranked = [...bestByAnimal.values()]
        .map(({ source_type, ref_id, distance }) => ({
            source_type,
            desertion_no: source_type === "rescue" ? ref_id : null,
            pawinhand_animal_id: source_type === "pawinhand" ? ref_id : null,
            similarity: 1 - distance
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, RESULT_LIMIT)

    if (ranked.length === 0) return []

    const savedMatches = await repository.upsertMatches(lostPostId, ranked.map((r) => ({
        source_type: r.source_type,
        ref_id: r.source_type === "rescue" ? r.desertion_no : r.pawinhand_animal_id,
        similarity: r.similarity
    })))
    const candidates = await repository.findMatchCandidates(savedMatches.map((match) => match.id))
    const candidatesById = new Map(candidates.map((candidate) => [candidate.match_id, candidate]))

    return ranked.map((result, index) => ({
        ...candidatesById.get(savedMatches[index].id),
        match_id: savedMatches[index].id,
        ...result
    }))
}

// 매칭 상세 조회

const SEX_LABEL = { M: "수컷", F: "암컷", Q: "미상", U: "미상" }
const DATE_PLAUSIBLE_DAYS = 60 // 실종일 이후 60일 이내 접수면 "가까움"으로 판단 (조정 가능)

function compareBreed(lostBreed, rescueKindNm) {
  if (!lostBreed || !rescueKindNm) {
    return { label: "품종", lost: lostBreed, rescue: rescueKindNm, status: "unknown" }
  }
  const isMatch =
    lostBreed.replace(/\s/g, "").includes(rescueKindNm.replace(/\s/g, "")) ||
    rescueKindNm.replace(/\s/g, "").includes(lostBreed.replace(/\s/g, ""))
  return { label: "품종", lost: lostBreed, rescue: rescueKindNm, status: isMatch ? "match" : "mismatch" }
}

function compareSex(lostSex, rescueSexCd) {
  if (!lostSex || lostSex === "Q" || !rescueSexCd || rescueSexCd === "Q") {
    return { label: "성별", lost: SEX_LABEL[lostSex] ?? "미상", rescue: SEX_LABEL[rescueSexCd] ?? "미상", status: "unknown" }
  }
  return {
    label: "성별",
    lost: SEX_LABEL[lostSex],
    rescue: SEX_LABEL[rescueSexCd],
    status: lostSex === rescueSexCd ? "match" : "mismatch",
  }
}

function compareColor(lostColor, rescueColorTags) {
  if (!lostColor || !rescueColorTags || rescueColorTags.length === 0) {
    return { label: "색상", lost: lostColor, rescue: rescueColorTags?.join(", "), status: "unknown" }
  }
  const isMatch = rescueColorTags.some(
    (tag) => tag.includes(lostColor) || lostColor.includes(tag),
  )
  return { label: "색상", lost: lostColor, rescue: rescueColorTags.join(", "), status: isMatch ? "match" : "mismatch" }
}

function compareRegion(lostRegion, regionSido, regionSigungu, happenPlace) {
  const rescueRegion = [regionSido, regionSigungu].filter(Boolean).join(" ") || happenPlace
  if (!lostRegion || !rescueRegion) {
    return { label: "지역", lost: lostRegion, rescue: rescueRegion, status: "unknown" }
  }
  const isMatch = lostRegion.includes(regionSido) || lostRegion.includes(regionSigungu)
  return { label: "지역", lost: lostRegion, rescue: rescueRegion, status: isMatch ? "match" : "mismatch" }
}

function compareDate(eventDate, happenDt) {
  if (!eventDate || !happenDt) {
    return { label: "날짜", lost: eventDate, rescue: happenDt, status: "unknown" }
  }
  const diffDays = Math.round((new Date(happenDt) - new Date(eventDate)) / (1000 * 60 * 60 * 24))
  const isPlausible = diffDays >= 0 && diffDays <= DATE_PLAUSIBLE_DAYS
  return {
    label: "날짜",
    lost: eventDate,
    rescue: happenDt,
    diffDays,
    status: isPlausible ? "match" : "mismatch",
  }
}

export async function getMatchDetail(matchId, userId) {
  const row = await repository.findMatchById(matchId)

  if (!row) {
    const error = new Error("매칭 결과를 찾을 수 없습니다.")
    error.status = 404
    error.code = "MATCH_NOT_FOUND"
    throw error
  }

  if (row.lost_post_owner_id !== userId) {
    const error = new Error("접근 권한이 없습니다.")
    error.status = 403
    error.code = "FORBIDDEN"
    throw error
  }

  return {
  similarity_score: row.similarity_score,
  lost_post: { id: row.lost_post_id, pet_name: row.pet_name, species: row.species },
  animal: {
    source_type: row.source_type,
    id: Number(row.animal_ref_id),
    up_kind_nm: row.up_kind_nm,
  },
  comparison: [
    compareBreed(row.breed, row.kind_nm),
    compareSex(row.sex, row.sex_cd),
    compareColor(row.color, row.color_tags),
    compareRegion(row.region, row.region_sido, row.region_sigungu, row.happen_place),
    compareDate(row.event_date, row.happen_dt),
    ],
  }
}
