import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import Loading from "../common/Loading.jsx"

// 로그인해야만 볼 수 있는 페이지를 감싸는 용도.
export default function ProtectedRoute() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Loading />
  if (!user) {
    // 로그인 페이지로 보낼 때 "원래 오려던 주소"를 state.from으로 함께 넘긴다.
    // 이걸 넘기지 않으면 LoginPage.jsx는 항상 홈으로만 돌려보내서, 예를 들어 /mypage를
    // 보려다 로그인 페이지로 밀려난 사람이 로그인을 마쳐도 다시 /mypage가 아니라 홈으로
    // 떨어지는 불편한 경험이 된다. (LoginPage.jsx의 redirectTo 관련 주석 참고)
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
