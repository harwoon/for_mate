import * as service from "./found-posts.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 4.1 발견제보 등록 (사진 최대 3장)
export async function createPost(req, res, next) {
  try {
    // TODO: 제보 저장 후 images 테이블에 사진 저장
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 4.2 발견제보 목록 조회 (게시판)
export async function getPosts(req, res, next) {
  try {
    // TODO: 번호, 제목, 발견 위치, 등록 시간 목록 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 4.3 발견제보 상세 조회
export async function getPost(req, res, next) {
  try {
    // TODO: 작성자 이름은 마스킹해서 반환 (예: kim****)
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 4.4 발견제보 수정
export async function updatePost(req, res, next) {
  try {
    // TODO: 작성자 본인인지 확인 후 수정
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 4.4 발견제보 삭제
export async function deletePost(req, res, next) {
  try {
    // TODO: 작성자 본인인지 확인 후 삭제
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
