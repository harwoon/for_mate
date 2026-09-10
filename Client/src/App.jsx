import { Routes, Route } from "react-router-dom"

// 공통 레이아웃
import Layout from "./components/layout/Layout.jsx"
import ProtectedRoute from "./components/layout/ProtectedRoute.jsx"

// 공통 페이지
import HomePage from "./pages/HomePage.jsx"
import NotFoundPage from "./pages/NotFoundPage.jsx"

// 인증
import LoginPage from "./pages/auth/LoginPage.jsx"
import SignupPage from "./pages/auth/SignupPage.jsx"

// 찾고있어요
import LostListPage from "./pages/lost/LostListPage.jsx"
import LostDetailPage from "./pages/lost/LostDetailPage.jsx"
import LostCreatePage from "./pages/lost/LostCreatePage.jsx"
import LostEditPage from "./pages/lost/LostEditPage.jsx"

// 보호중이에요
import RescueListPage from "./pages/rescue/RescueListPage.jsx"
import RescueDetailPage from "./pages/rescue/RescueDetailPage.jsx"

// 발견제보
import FoundListPage from "./pages/found/FoundListPage.jsx"
import FoundDetailPage from "./pages/found/FoundDetailPage.jsx"
import FoundCreatePage from "./pages/found/FoundCreatePage.jsx"
import FoundEditPage from "./pages/found/FoundEditPage.jsx"

// AI 매칭
import AiSearchPage from "./pages/match/AiSearchPage.jsx"
import MatchResultPage from "./pages/match/MatchResultPage.jsx"
import MatchComparePage from "./pages/match/MatchComparePage.jsx"

// 마이페이지
import MyPage from "./pages/mypage/MyPage.jsx"
import MyLostPostsPage from "./pages/mypage/MyLostPostsPage.jsx"
import MyFoundPostsPage from "./pages/mypage/MyFoundPostsPage.jsx"
import MyBookmarksPage from "./pages/mypage/MyBookmarksPage.jsx"
import NotificationPage from "./pages/mypage/NotificationPage.jsx"
import MyInquiriesPage from "./pages/mypage/MyInquiriesPage.jsx"
import MyInquiryDetailPage from "./pages/mypage/MyInquiryDetailPage.jsx"

// 고객지원
import SupportPage from "./pages/support/SupportPage.jsx"
import TermsPage from "./pages/support/TermsPage.jsx"
import PrivacyPage from "./pages/support/PrivacyPage.jsx"
import AboutPage from "./pages/support/AboutPage.jsx"

// 관리자
import AdminPage from "./pages/admin/AdminPage.jsx"
import AdminLoginPage from "./pages/admin/AdminLoginPage.jsx"
import AdminLayout from "./components/layout/AdminLayout.jsx"
import AdminRoute from "./components/layout/AdminRoute.jsx"
import AdminLostPostsPage from "./pages/admin/AdminLostPostsPage.jsx"
import AdminFoundPostsPage from "./pages/admin/AdminFoundPostsPage.jsx"
import AdminReportsPage from "./pages/admin/AdminReportsPage.jsx"
import AdminInquiriesPage from "./pages/admin/AdminInquiriesPage.jsx"
import AdminInquiryDetailPage from "./pages/admin/AdminInquiryDetailPage.jsx"
import AdminMatchesPage from "./pages/admin/AdminMatchesPage.jsx"

export default function App() {
    return (
        <Routes>
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route element={<AdminRoute />}>
                <Route element={<AdminLayout />}>
                    <Route path="/admin" element={<AdminPage />} />
                    <Route path="/admin/lost-posts" element={<AdminLostPostsPage />} />
                    <Route path="/admin/found-posts" element={<AdminFoundPostsPage  />} />
                    <Route path="/admin/reports" element={<AdminReportsPage />} />
                    <Route path="/admin/inquiries" element={<AdminInquiriesPage  />} />
                    <Route path="/admin/inquiries/:inquiryId" element={<AdminInquiryDetailPage />}/>
                    <Route path="/admin/matches" element={<AdminMatchesPage />} />
                </Route>
            </Route>
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
                    <Route
                        path="/mypage/lost-posts"
                        element={<MyLostPostsPage />}
                    />
                    <Route
                        path="/mypage/found-posts"
                        element={<MyFoundPostsPage />}
                    />
                    <Route
                        path="/mypage/bookmarks"
                        element={<MyBookmarksPage />}
                    />
                    <Route
                        path="/mypage/inquiries"
                        element={<MyInquiriesPage />}
                    />
                    <Route
                        path="/mypage/inquiries/:inquiryId"
                        element={<MyInquiryDetailPage />}
                    />
                    <Route path="/notifications" element={<NotificationPage />} />

                </Route>

                <Route path="*" element={<NotFoundPage />} />
            </Route>
        </Routes>
    )
}
