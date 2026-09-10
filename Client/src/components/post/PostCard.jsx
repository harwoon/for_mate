import { Link } from "react-router-dom"
import Badge from "../common/Badge.jsx"

// 찾고있어요 / 보호중이에요 목록에 쓰는 공통 카드
export default function PostCard({
    to,
    thumbnail,
    badgeType,
    badgeText,
    breed,
    region,
    date
}) {
    return (
        <Link
            to={to}
            className="post-card"
        >
            <div className="post-card-image-wrap">
                {thumbnail ? (
                    <img
                        className="post-card-thumb"
                        src={thumbnail}
                        alt={breed ? `${breed} 사진` : "동물 사진"}
                    />
                ) : (
                    <div className="post-card-image-empty">
                        <i
                            className="ri-image-line"
                            aria-hidden="true"
                        />

                        <span>
                            이미지 없음
                        </span>
                    </div>
                )}
            </div>

            <div className="post-card-body">
                <Badge type={badgeType}>
                    {badgeText}
                </Badge>

                <h3 className="post-card-title">
                    {breed || "품종 정보 없음"}
                </h3>

                <div className="post-card-info">
                    <p className="post-card-meta">
                        <i
                            className="ri-map-pin-line"
                            aria-hidden="true"
                        />

                        <span>
                            {region || "지역 정보 없음"}
                        </span>
                    </p>

                    <p className="post-card-meta post-card-date">
                        <i
                            className="ri-time-line"
                            aria-hidden="true"
                        />

                        <span>
                            {date || "날짜 정보 없음"}
                        </span>
                    </p>
                </div>
            </div>
        </Link>
    )
}