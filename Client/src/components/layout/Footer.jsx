import { Link } from "react-router-dom"

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span className="header-logo">For Mate</span>

        <div className="footer-links">
          {/* /pages/terms처럼 만들면 vite proxy가 백엔드로 넘겨버려 raw JSON이 보인다.
              그래서 화면 주소는 /terms처럼 "/pages" 접두어 없이 쓴다. (App.jsx 주석 참고) */}
          <Link to="/terms">이용약관</Link>
          <Link to="/privacy">개인정보처리방침</Link>
          <Link to="/support">고객센터</Link>
          <Link to="/about">서비스소개</Link>
        </div>

        <span>© 2026 For Mate All rights reserved.</span>
      </div>
    </footer>
  )
}
