import { Routes, Route } from "react-router-dom"

import Layout from "./components/layout/Layout.jsx"
import ProtectedRoute from "./components/layout/ProtectedRoute.jsx"

import HomePage from "./pages/HomePage.jsx"
import NotFoundPage from "./pages/NotFoundPage.jsx"

import LoginPage from "./pages/auth/LoginPage.jsx"
import SignupPage from "./pages/auth/SignupPage.jsx"

import LostListPage from "./pages/lost/LostListPage.jsx"
import LostDetailPage from "./pages/lost/LostDetailPage.jsx"
import LostCreatePage from "./pages/lost/LostCreatePage.jsx"

import RescueListPage from "./pages/rescue/RescueListPage.jsx"
import RescueDetailPage from "./pages/rescue/RescueDetailPage.jsx"

import FoundListPage from "./pages/found/FoundListPage.jsx"
import FoundDetailPage from "./pages/found/FoundDetailPage.jsx"
import FoundCreatePage from "./pages/found/FoundCreatePage.jsx"

import AiSearchPage from "./pages/match/AiSearchPage.jsx"
import MatchResultPage from "./pages/match/MatchResultPage.jsx"
import MatchComparePage from "./pages/match/MatchComparePage.jsx"

import MyPage from "./pages/mypage/MyPage.jsx"
import NotificationPage from "./pages/mypage/NotificationPage.jsx"

import SupportPage from "./pages/support/SupportPage.jsx"
import TermsPage from "./pages/support/TermsPage.jsx"
import PrivacyPage from "./pages/support/PrivacyPage.jsx"
import AboutPage from "./pages/support/AboutPage.jsx"

import AdminPage from "./pages/admin/AdminPage.jsx"

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* 누구나 볼 수 있는 페이지 */}
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />

        <Route path="/lost-posts" element={<LostListPage />} />
        <Route path="/lost-posts/:id" element={<LostDetailPage />} />

        <Route path="/rescue-animals" element={<RescueListPage />} />
        <Route path="/rescue-animals/:desertionNo" element={<RescueDetailPage />} />

        <Route path="/found-posts" element={<FoundListPage />} />
        <Route path="/found-posts/:id" element={<FoundDetailPage />} />

        {/* 주의: 이 세 페이지의 주소를 /pages/terms 처럼 만들지 않는다.
            vite.config.js의 proxy 설정이 "/pages"로 시작하는 모든 요청(새 탭으로 직접 열 때 브라우저가
            보내는 요청 포함)을 백엔드(4000번 포트)로 그대로 넘겨버리기 때문에, 그렇게 하면 React가 렌더링한
            화면 대신 백엔드가 돌려주는 raw JSON이 그대로 보여버린다. (백엔드 API 주소인 GET /pages/terms 등은
            Client/src/api/pages.api.js가 fetch로 호출하는 용도로만 쓰이고, 화면 주소와는 겹치면 안 된다)
            그래서 화면 주소는 /terms, /privacy, /about처럼 "/pages" 접두어 없이 만든다. */}
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* 고객센터(/support)는 원래 아래 <ProtectedRoute> 안에 있어서, 비회원이 메인화면의
            "고객센터" 버튼을 누르면 문의를 써보기도 전에 곧바로 로그인 페이지로 넘어갔다.
            "비회원도 문의 작성 화면 자체는 볼 수 있어야 한다"는 요청에 따라 여기(누구나
            볼 수 있는 구역)로 옮겼다. 대신 실제 "문의 등록"은 로그인한 사람만 할 수 있어야
            하므로, 그 판단은 페이지 진입 시점이 아니라 SupportPage.jsx 안에서 등록 버튼을
            눌렀을 때(handleSubmit)로 옮겨뒀다 — 백엔드 inquiries.router.js도 여전히
            requireAuth로 POST /inquiries를 막고 있어서, 실제 등록 자체는 그대로 로그인한
            사람만 가능하다 (SupportPage.jsx 상단 주석 참고). */}
        <Route path="/support" element={<SupportPage />} />

        {/* 로그인해야 볼 수 있는 페이지 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/lost-posts/new" element={<LostCreatePage />} />
          <Route path="/found-posts/new" element={<FoundCreatePage />} />

          <Route path="/ai-search" element={<AiSearchPage />} />
          <Route path="/lost-posts/:id/matches" element={<MatchResultPage />} />
          <Route path="/matches/:matchId" element={<MatchComparePage />} />

          <Route path="/mypage" element={<MyPage />} />
          <Route path="/notifications" element={<NotificationPage />} />

          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
