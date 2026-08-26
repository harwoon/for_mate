import * as service from "./lost-posts.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 3.1 실종 공고 등록 (사진 최대 8장)
export async function createPost(req, res, next) {
  try {
    // TODO: 공고 저장 후 images 테이블에 사진 저장, 임베딩 추출 요청
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 3.2 실종 공고 목록 조회 (필터링)
export async function getPosts(req, res, next) {
  try {
    // TODO: species, breed, color, region, 기간 필터 + 페이지네이션
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 3.3 실종 공고 상세 조회
export async function getPost(req, res, next) {
  try {
    // TODO: 공고 + 사진 목록 조회, 본인 글이면 is_owner true
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 3.4 실종 공고 수정
export async function updatePost(req, res, next) {
  try {
    // TODO: 작성자 본인인지 확인 후 수정
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 3.4 상태 변경 (찾음 처리)
export async function updateStatus(req, res, next) {
  try {
    // TODO: status를 active/closed로 변경
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 3.4 실종 공고 삭제
export async function deletePost(req, res, next) {
  try {
    // TODO: 작성자 본인인지 확인 후 삭제
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
