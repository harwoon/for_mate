import * as service from "./matches.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 6.1 AI 매칭 결과 조회
export async function getMatches(req, res, next) {
  try {
    // TODO: 당일 결과 있으면 그대로 반환, 없으면 ML 서버에 유사도 계산 요청 후 저장
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 6.2 매칭 상세 비교 조회
export async function getMatchDetail(req, res, next) {
  try {
    // TODO: 품종/성별/색상/지역/날짜를 항목별로 비교해서 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 6.3 매칭 재계산 요청
export async function refreshMatches(req, res, next) {
  try {
    // TODO: 캐시 무시하고 다시 계산 (일일 횟수 제한)
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 6.4 매칭 후보 제외
export async function addExclusion(req, res, next) {
  try {
    // TODO: match_exclusions에 저장
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 6.5 제외 목록 조회
export async function getExclusions(req, res, next) {
  try {
    // TODO: 해당 공고의 제외 목록 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 6.5 제외 해제
export async function removeExclusion(req, res, next) {
  try {
    // TODO: 제외 항목 삭제
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
