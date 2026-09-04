import { get } from "./client.js"

// 백엔드: Server/src/modules/pages/pages.router.js
// 이용약관 / 개인정보처리방침 / 서비스소개 같은, 자주 안 바뀌는 정적 페이지 내용을 가져온다.
//
// 주의: 이 글을 쓰는 시점 기준으로 백엔드 pages.controller.js는 아직 TODO 상태라
// 항상 501 NOT_IMPLEMENTED를 반환한다. 그래도 프론트는 이 함수들을 정상 API처럼 호출해두면,
// 백엔드가 완성되는 순간 별도 수정 없이 실제 데이터를 받아오게 된다.
// (TermsPage.jsx / PrivacyPage.jsx에서 이 응답이 오기 전까지는 피그마 원문을 그대로 보여준다)
export const getTerms = () => get("/pages/terms")
export const getPrivacy = () => get("/pages/privacy")
export const getAbout = () => get("/pages/about")
