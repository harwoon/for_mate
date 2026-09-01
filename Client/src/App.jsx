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

        <Route path="/pages/terms" element={<TermsPage />} />
        <Route path="/pages/privacy" element={<PrivacyPage />} />
        <Route path="/pages/about" element={<AboutPage />} />

        {/* 로그인해야 볼 수 있는 페이지 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/lost-posts/new" element={<LostCreatePage />} />
          <Route path="/found-posts/new" element={<FoundCreatePage />} />

          <Route path="/ai-search" element={<AiSearchPage />} />
          <Route path="/lost-posts/:id/matches" element={<MatchResultPage />} />
          <Route path="/matches/:matchId" element={<MatchComparePage />} />

          <Route path="/mypage" element={<MyPage />} />
          <Route path="/notifications" element={<NotificationPage />} />
          <Route path="/support" element={<SupportPage />} />

          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
