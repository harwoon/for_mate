import * as repository from "./matches.repository.js"

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.

const CANDIDATE_LIMIT_PER_VECTOR = 20
const RESULT_LIMIT = 10

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.
// 캐시 조회가 아니라 요청마다 실시간으로 계산한다.
export async function getMatches(lostPostId) {
  const vectors = await repository.findLostPostEmbeddings(lostPostId)

  if (vectors.length === 0) {
    const error = new Error("이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
    error.status = 409
    error.code = "EMBEDDINGS_NOT_READY"
    throw error
  }

  // 사진 벡터마다 후보를 조회해서, desertion_no별로 가장 가까웠던 거리만 남긴다.
  const bestByAnimal = new Map()

  for (const vector of vectors) {
    const candidates = await repository.findNearestRescueCandidates(
      vector,
      CANDIDATE_LIMIT_PER_VECTOR,
    )
    for (const { desertion_no, distance } of candidates) {
      const key = Number(desertion_no)
      const current = bestByAnimal.get(key)
      if (current === undefined || distance < current) {
        bestByAnimal.set(key, distance)
      }
    }
  }

  const ranked = [...bestByAnimal.entries()]
    .map(([desertion_no, distance]) => ({
      desertion_no,
      similarity: 1 - distance,
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, RESULT_LIMIT)

  if (ranked.length > 0) {
    await repository.upsertMatches(lostPostId, ranked)
  }

  return ranked
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
    lost_post: {
      id: row.lost_post_id,
      pet_name: row.pet_name,
      species: row.species,
    },
    rescue_animal: {
      desertion_no: row.desertion_no,
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