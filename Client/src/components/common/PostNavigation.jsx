import { formatTimestampDate } from "../../utils/date.js"
import { Link } from "react-router-dom"
import "../../css/components.css"

function formatDate(value) {
    if (!value) return ""

    return String(value)
        .slice(0, 10)
        .replaceAll("-", ".")
}

function getDefaultTitle(post) {
    const name = post.pet_name || "이름 없음"
    const species = post.species || "종류 미상"
    const breed = post.breed || "품종 미상"

    return `${name}(${species}) - ${breed}`
}

export default function PostNavigation({
    previousPost,
    nextPost,
    basePath,
    getPath,
    getTitle = getDefaultTitle,
    getDate,
    formatNavigationDate = getDate ? formatDate : formatTimestampDate
}) {
    function resolvePath(post) {
        if (getPath) {
            return getPath(post)
        }

        return `${basePath}/${post.id}`
    }

    return (
        <nav
            className="post-navigation"
            aria-label="이전글 다음글"
        >
            {previousPost ? (
                <Link
                    to={resolvePath(previousPost)}
                    className="post-navigation-row"
                >
                    <span className="post-navigation-label">
                        <i
                            className="ri-arrow-up-s-line"
                            aria-hidden="true"
                        />
                        이전글
                    </span>

                    <span className="post-navigation-title">
                        {getTitle(previousPost)}
                    </span>

                    <span className="post-navigation-date">
                        {formatNavigationDate(
                            getDate ? getDate(previousPost) : previousPost.created_at
                        )}
                    </span>
                </Link>
            ) : (
                <div className="post-navigation-row is-disabled">
                    <span className="post-navigation-label">
                        <i
                            className="ri-arrow-up-s-line"
                            aria-hidden="true"
                        />
                        이전글
                    </span>

                    <span className="post-navigation-title">
                        이전글이 없습니다.
                    </span>
                </div>
            )}

            {nextPost ? (
                <Link
                    to={resolvePath(nextPost)}
                    className="post-navigation-row"
                >
                    <span className="post-navigation-label">
                        <i
                            className="ri-arrow-down-s-line"
                            aria-hidden="true"
                        />
                        다음글
                    </span>

                    <span className="post-navigation-title">
                        {getTitle(nextPost)}
                    </span>

                    <span className="post-navigation-date">
                        {formatNavigationDate(
                            getDate ? getDate(nextPost) : nextPost.created_at
                        )}
                    </span>
                </Link>
            ) : (
                <div className="post-navigation-row is-disabled">
                    <span className="post-navigation-label">
                        <i
                            className="ri-arrow-down-s-line"
                            aria-hidden="true"
                        />
                        다음글
                    </span>

                    <span className="post-navigation-title">
                        다음글이 없습니다.
                    </span>
                </div>
            )}
        </nav>
    )
}