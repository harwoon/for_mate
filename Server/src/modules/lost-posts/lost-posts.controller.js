import * as service from "./lost-posts.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 3.1 실종 공고 등록 (사진 최대 8장)
export async function createPost(req, res, next) {
  try {
    // TODO: 공고 저장 후 images 테이블에 사진 저장, 
    // 추후 해야하는 것: 임베딩 추출 요청
    const post = await service.createPost({
      userId:req.userId,
      body:req.body,
      imageUrls: req.imageUrls
    })
    created(res,post)
  } catch (err) {
    next(err)
  }
}

// 3.2 실종 공고 목록 조회 (필터링)
export async function getPosts(req, res, next) {
  try {
    // URL 쿼리의 필터와 페이지 정보를 서비스에서 검증한 뒤 조회한다.
    const result = await service.getPosts(req.query)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// 3.3 실종 공고 상세 조회
export async function getPost(req, res, next) {
  try {
    // URL의 공고 ID와 로그인 사용자 ID(존재하는 경우)를 서비스에 전달한다.
    const post = await service.getPost({
      postId: req.params.id,
      userId: req.userId,
    })

    // 조회한 공고와 사진 목록을 공통 성공 응답 형식으로 반환한다.
    ok(res, post)
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
