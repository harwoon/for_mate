import { Link } from "react-router-dom"
import "../../css/components.css"

function formatDate(value) {
    if (!value) return ""

    return String(value)
        .slice(0, 10)
        .replaceAll("-", ".")
}

function getLostTitle(post) {
    const name = post.pet_name || "이름 없음"
    const species = post.species || "종류 미상"
    const breed = post.breed || "품종 미상"

    return `${name}(${species}) - ${breed}`
}

export default function PostNavigation({
    previousPost,
    nextPost,
    basePath
}) {
    return (
        <nav
            className="post-navigation"
            aria-label="이전글 다음글"
        >
            {previousPost ? (
                <Link
                    to={`${basePath}/${previousPost.id}`}
                    className="post-navigation-row"
                >
                    <span className="post-navigation-label">
                        ▲ 이전글
                    </span>

                    <span className="post-navigation-title">
                        {getLostTitle(previousPost)}
                    </span>

                    <span className="post-navigation-date">
                        {formatDate(previousPost.created_at)}
                    </span>
                </Link>
            ) : (
                <div className="post-navigation-row">
                    <span className="post-navigation-label">
                        ▲ 이전글
                    </span>

                    <span className="post-navigation-title">
                        이전글이 없습니다.
                    </span>
                </div>
            )}

            {nextPost ? (
                <Link
                    to={`${basePath}/${nextPost.id}`}
                    className="post-navigation-row"
                >
                    <span className="post-navigation-label">
                        ▼ 다음글
                    </span>

                    <span className="post-navigation-title">
                        {getLostTitle(nextPost)}
                    </span>

                    <span className="post-navigation-date">
                        {formatDate(nextPost.created_at)}
                    </span>
                </Link>
            ) : (
                <div className="post-navigation-row">
                    <span className="post-navigation-label">
                        ▼ 다음글
                    </span>

                    <span className="post-navigation-title">
                        다음글이 없습니다.
                    </span>
                </div>
            )}
        </nav>
    )
}