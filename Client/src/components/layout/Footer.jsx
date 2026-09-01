import { Link } from "react-router-dom"

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <span className="header-logo">For Mate</span>

        <div className="footer-links">
          <Link to="/pages/terms">이용약관</Link>
          <Link to="/pages/privacy">개인정보처리방침</Link>
          <Link to="/support">고객센터</Link>
          <Link to="/pages/about">서비스소개</Link>
        </div>

        <span>© 2026 For Mate All rights reserved.</span>
      </div>
    </footer>
  )
}
