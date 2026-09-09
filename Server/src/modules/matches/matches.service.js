import * as repository from "./matches.repository.js"

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.
// 당일 첫 요청에만 계산하고, 이후에는 저장된 결과를 그대로 반환한다.

// TODO: 아래 컨트롤러에서 호출할 함수들을 구현한다
// - getMatches: 6.1 AI 매칭 결과 조회
// - getMatchDetail: 6.2 매칭 상세 비교 조회
// - refreshMatches: 6.3 매칭 재계산 요청
// - addExclusion: 6.4 매칭 후보 제외
// - getExclusions: 6.5 제외 목록 조회
// - removeExclusion: 6.5 제외 해제

const CANDIDATE_LIMIT_PER_VECTOR = 20
const RESULT_LIMIT = 10

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.
// 캐시 조회가 아니라 요청마다 실시간으로 계산한다 (임베딩은 이미 계산돼 있어 부담 없음).
export async function getMatches(lostPostId) {
  const vectors = await repository.findLostPostEmbeddings(lostPostId)

  if (vectors.length === 0) {
    const error = new Error("이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.")
    error.status = 409
    error.code = "EMBEDDINGS_NOT_READY"
    throw error
  }

  const excludedIds = await repository.findExcludedDesertionNos(lostPostId)

  // 사진 벡터마다 후보를 조회해서, desertion_no별로 가장 가까웠던 거리만 남긴다.
  const bestByAnimal = new Map()

  for (const vector of vectors) {
    const candidates = await repository.findNearestRescueCandidates(
      vector,
      excludedIds,
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