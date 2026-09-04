import { get } from "./client.js"

// 백엔드: 아직 구현되지 않음 (자주 묻는 질문을 DB로 관리하는 기능은 이번 작업 범위 밖이라,
// Server/src/modules 안에 faq 모듈 자체가 없다 — inquiries, pages 옆에 나중에 생길 자리다).
//
// pages.api.js가 "백엔드가 아직 TODO 상태라도 프론트는 정상 API처럼 호출해 둔다"고 했던
// 것과 같은 이유로, 여기서도 실제 백엔드 경로(GET /faqs)를 미리 정해서 호출해 둔다.
// 지금은 이 경로가 백엔드에 없어서 요청이 실패하지만, SupportPage.jsx가 그 실패를
// "아직 등록된 질문이 없음"과 똑같이 처리하기 때문에 화면은 깨지지 않는다. 나중에
// Server/src/modules/faq/ 가 만들어져서 DB에서 질문/답변 목록을 내려주기 시작하면,
// 프론트는 이 함수 하나만 그대로 쓰면 되고 SupportPage.jsx는 손댈 필요가 없다.
//
// 응답 형태는 [{ id, question, answer }, ...] 배열을 가정한다 (문의 유형처럼 고정 목록이
// 아니라 관리자가 DB에 넣고 빼는 값이라고 보고, 각 항목을 구분할 id를 포함시켰다).
export const getFaqs = () => get("/faqs")
