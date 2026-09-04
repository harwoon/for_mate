import * as service from "./pages.service.js"
import { ok } from "../../utils/response.js"

// 12. 이용약관
// service.getTerms()가 { title, sections } 형태를 반환하고, 이걸 그대로 data에 담아 보낸다.
// (프론트 Client/src/pages/support/TermsPage.jsx가 이 모양을 그대로 기대하고 있다: data || FALLBACK_TERMS)
export async function getTerms(req, res, next) {
  try {
    ok(res, await service.getTerms())
  } catch (err) {
    next(err)
  }
}

// 12. 개인정보처리방침
export async function getPrivacy(req, res, next) {
  try {
    ok(res, await service.getPrivacy())
  } catch (err) {
    next(err)
  }
}

// 12. 서비스소개
export async function getAbout(req, res, next) {
  try {
    ok(res, await service.getAbout())
  } catch (err) {
    next(err)
  }
}
