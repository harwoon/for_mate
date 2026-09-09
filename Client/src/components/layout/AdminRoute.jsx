import { Navigate, Outlet, useLocation } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import Loading from "../common/Loading.jsx"

export default function AdminRoute() {
    const { user, loading } = useAuth()
    const location = useLocation()

    if (loading) return <Loading message="관리자 권한을 확인하는 중입니다." />
    if (!user) return <Navigate to="/admin/login" state={{ from: location.pathname }} replace />
    if (user.is_admin !== true) return <Navigate to="/" replace />

    return <Outlet />
}
