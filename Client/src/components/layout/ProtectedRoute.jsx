import { Navigate, Outlet } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import Loading from "../common/Loading.jsx"

// 로그인해야만 볼 수 있는 페이지를 감싸는 용도.
export default function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />

  return <Outlet />
}
