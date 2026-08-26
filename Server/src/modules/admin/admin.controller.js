import * as service from "./admin.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 관리자 대시보드 통계
export async function getDashboard(req, res, next) {
  try {
    // TODO: 전체 공고 수, 신규 등록 수, 신고 건수 등 집계
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 실종 공고 관리
export async function getLostPosts(req, res, next) {
  try {
    // TODO: 전체 실종 공고 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 발견제보 관리
export async function getFoundPosts(req, res, next) {
  try {
    // TODO: 전체 발견제보 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 신고 목록 조회
export async function getReports(req, res, next) {
  try {
    // TODO: 처리 상태별 신고 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 10.2 신고 처리
export async function updateReport(req, res, next) {
  try {
    // TODO: status를 resolved/rejected로 변경
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 문의 관리
export async function getInquiries(req, res, next) {
  try {
    // TODO: 전체 문의 목록 조회
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
