import * as service from "./inquiries.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 11.1 문의 등록
// POST /inquiries  (requireAuth 통과 필수)
export async function createInquiry(req, res, next) {
  try {
    // requireAuth 미들웨어가 넣어준 req.userId(로그인 사용자 PK)와
    // 요청 본문({ type, title, content })을 서비스에 넘긴다.
    // 컨트롤러는 HTTP 입출력만 담당하고, 검증/저장 로직은 서비스가 맡는다.
    const inquiry = await service.createInquiry(req.userId, req.body)
    // created(): 201 + { success: true, data: inquiry } 형태로 응답 (명세 Response 201과 동일)
    created(res, inquiry)
  } catch (err) {
    // 서비스에서 던진 에러(status/code 포함)를 공통 에러 핸들러로 전달한다.
    next(err)
  }
}

// 11.2 내 문의 목록 조회
// GET /inquiries  (requireAuth 통과 필수)
export async function getInquiries(req, res, next) {
  try {
    // requireAuth 미들웨어가 넣어준 req.userId(로그인한 사용자 PK)로
    // "이 사람이 등록한 문의들"만 서비스에서 조회해 온다.
    // (다른 사람 문의까지 보이면 안 되므로 반드시 req.userId를 넘겨야 한다)
    const inquiries = await service.getInquiries(req.userId)

    // ok(): 200 + { success: true, data: inquiries } 형태로 응답
    // createInquiry가 성공(201)이면 created()를 쓰듯, 단순 조회 성공(200)은 ok()를 쓴다.
    ok(res, inquiries)
  } catch (err) {
    // 지금은 서비스에서 별도 에러를 던지지 않지만, 나중에 에러가 생겨도
    // 여기서 next(err)로 넘기기만 하면 error.middleware.js가 알아서 처리해 준다.
    next(err)
  }
}

// 11.2 문의 상세 조회
// GET /inquiries/:inquiryId  (requireAuth 통과 필수)
export async function getInquiry(req, res, next) {
  try {
    // requireAuth 미들웨어가 넣어준 req.userId(로그인 사용자 PK)와
    // 라우터가 넘겨준 URL 경로 값 req.params.inquiryId(예: "/inquiries/501" -> "501")를
    // 그대로 서비스에 전달한다. 문자열 -> 숫자 변환, 존재 여부, 본인 소유 여부 확인은
    // 전부 서비스(inquiries.service.js)가 담당한다. (컨트롤러는 HTTP 입출력만 담당)
    const inquiry = await service.getInquiry(req.userId, req.params.inquiryId)

    // ok(): 200 + { success: true, data: inquiry } 형태로 응답 (명세 Response 200과 동일)
    ok(res, inquiry)
  } catch (err) {
    // 서비스에서 던진 에러(400/404/403 등, status/code 포함)를 공통 에러 핸들러로 전달한다.
    // 예) 잘못된 id -> 400, 없는 문의 -> 404, 남의 문의 -> 403
    next(err)
  }
}
