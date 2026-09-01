import { Link } from "react-router-dom"
import Badge from "../common/Badge.jsx"

// 찾고있어요 / 보호중이에요 목록에 쓰는 카드
export default function PostCard({ to, thumbnail, badgeType, badgeText, breed, region, date }) {
  return (
    <Link to={to} className="post-card">
      <img className="post-card-thumb" src={thumbnail} alt="" />
      <div className="post-card-body">
        <Badge type={badgeType}>{badgeText}</Badge>
        <p className="post-card-title">{breed}</p>
        <p className="post-card-meta">{region}</p>
        <p className="post-card-meta">{date}</p>
      </div>
    </Link>
  )
}
