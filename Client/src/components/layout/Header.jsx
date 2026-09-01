import { Link, NavLink } from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"

// 상단 고정 메뉴. 피그마의 4개 메뉴 구성을 그대로 따른다.
export default function Header() {
  const { user, logout } = useAuth()

  return (
    <header className="header">
      <div className="container header-inner">
        <Link to="/" className="header-logo">For Mate</Link>

        <nav className="header-nav">
          <NavLink to="/lost-posts">찾고있어요</NavLink>
          <NavLink to="/rescue-animals">보호중이에요</NavLink>
          <NavLink to="/ai-search">AI로 찾기</NavLink>
          <NavLink to="/found-posts">발견제보</NavLink>
        </nav>

        <div className="header-actions">
          {user ? (
            <>
              <Link to="/notifications" className="text-sub">알림</Link>
              <Link to="/mypage" className="text-sub">마이페이지</Link>
              <button className="btn btn-text" onClick={logout}>로그아웃</button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary btn-sm">로그인</Link>
          )}
        </div>
      </div>
    </header>
  )
}
