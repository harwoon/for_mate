import { createContext, useContext, useEffect, useState } from "react"
import * as authApi from "../api/auth.api.js"

// 로그인한 사용자 정보를 앱 전체에서 공유한다.
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // 새로고침해도 로그인이 유지되도록, 처음 켤 때 내 정보를 한 번 불러온다.
  useEffect(() => {
    authApi
      .getMe()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  async function login(credentials) {
    const data = await authApi.login(credentials)
    setUser(data.user)
    return data.user
  }

  async function logout() {
    await authApi.logout()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

// 컴포넌트에서 const { user } = useAuth() 처럼 쓴다.
export function useAuth() {
  return useContext(AuthContext)
}
