import { get, post } from "./client.js"

// 백엔드: Server/src/modules/inquiries/inquiries.router.js
// 문의 등록/조회는 전부 로그인이 필요하다 (requireAuth). App.jsx에서도 /support를
// <ProtectedRoute> 안에 넣어뒀으므로, 이 함수들이 호출되는 시점엔 이미 로그인된 상태다.
export const createInquiry = (payload) => post("/inquiries", payload) // 11.1 문의 등록 (피그마 C-05)

// 아래 두 개는 피그마 C-05 화면(문의 작성 + FAQ) 자체에는 나오지 않는 "내 문의함" 기능이라
// SupportPage.jsx에서는 아직 쓰지 않지만, 백엔드에는 이미 구현되어 있어 미리 만들어 둔다.
// (pages.api.js가 백엔드보다 먼저 만들어졌던 것과 반대로, 이번엔 백엔드가 먼저 완성된 경우다)
export const getInquiries = () => get("/inquiries") // 11.2 내 문의 목록 조회
export const getInquiry = (inquiryId) => get(`/inquiries/${inquiryId}`) // 11.2 문의 상세 조회 (답변 확인)
