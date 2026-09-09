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
import LostEditPage from "./pages/lost/LostEditPage.jsx"

import RescueListPage from "./pages/rescue/RescueListPage.jsx"
import RescueDetailPage from "./pages/rescue/RescueDetailPage.jsx"

import FoundListPage from "./pages/found/FoundListPage.jsx"
import FoundDetailPage from "./pages/found/FoundDetailPage.jsx"
import FoundCreatePage from "./pages/found/FoundCreatePage.jsx"
import FoundEditPage from "./pages/found/FoundEditPage.jsx"

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
                <Route
                    path="/rescue-animals/:sourceType/:animalId"
                    element={<RescueDetailPage />}
                />
                <Route
                    path="/rescue-animals/:desertionNo"
                    element={<RescueDetailPage />}
                />

                <Route path="/found-posts" element={<FoundListPage />} />
                <Route path="/found-posts/:id" element={<FoundDetailPage />} />

                {/* 화면 주소와 백엔드 /pages API 주소가 충돌하지 않도록 분리한다. */}
                <Route path="/terms" element={<TermsPage />} />
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="/about" element={<AboutPage />} />

                {/* 문의 화면은 비회원도 볼 수 있고 실제 등록 시 로그인 여부를 확인한다. */}
                <Route path="/support" element={<SupportPage />} />

                {/* 로그인해야 볼 수 있는 페이지 */}
                <Route element={<ProtectedRoute />}>
                    <Route path="/lost-posts/new" element={<LostCreatePage />} />

                    {/* /lost-posts는 Vite proxy 대상이므로 수정 화면 URL은 별도 경로를 사용한다. */}
                    <Route path="/lost-edit/:id" element={<LostEditPage />} />

                    <Route path="/found-posts/new" element={<FoundCreatePage />} />
                    <Route path="/found-edit/:id" element={<FoundEditPage />} />

                    <Route path="/ai-search" element={<AiSearchPage />} />
                    <Route
                        path="/lost-posts/:id/matches"
                        element={<MatchResultPage />}
                    />
                    <Route
                        path="/matches/:matchId"
                        element={<MatchComparePage />}
                    />

                    <Route path="/mypage" element={<MyPage />} />
                    <Route path="/notifications" element={<NotificationPage />} />

                    <Route path="/admin" element={<AdminPage />} />
                </Route>

                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    )
}