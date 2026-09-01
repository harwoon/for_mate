import { Outlet } from "react-router-dom"
import Header from "./Header.jsx"
import Footer from "./Footer.jsx"

// 모든 페이지가 이 안에 들어간다. (헤더 + 본문 + 푸터)
export default function Layout() {
  return (
    <div className="page">
      <Header />
      <main className="page-body">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
