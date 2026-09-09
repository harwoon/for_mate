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
    basePath,
    getPath,
    getTitle = getLostTitle,
    getDate = (post) => post.created_at
}) {
    function createPath(post) {
        if (getPath) {
            return getPath(post)
        }

        return `${basePath}/${post.id}`
    }

    function NavigationRow({
        post,
        type
    }) {
        const isPrevious = type === "previous"

        const label = isPrevious
            ? "▲ 이전글"
            : "▼ 다음글"

        if (!post) {
            return (
                <div className="post-navigation-row">
                    <span className="post-navigation-label">
                        {label}
                    </span>

                    <span className="post-navigation-title">
                        {isPrevious
                            ? "이전글이 없습니다."
                            : "다음글이 없습니다."}
                    </span>
                </div>
            )
        }

        return (
            <Link
                to={createPath(post)}
                className="post-navigation-row"
            >
                <span className="post-navigation-label">
                    {label}
                </span>

                <span className="post-navigation-title">
                    {getTitle(post)}
                </span>

                <span className="post-navigation-date">
                    {formatDate(
                        getDate(post)
                    )}
                </span>
            </Link>
        )
    }

    return (
        <nav
            className="post-navigation"
            aria-label="이전글 다음글"
        >
            <NavigationRow
                post={previousPost}
                type="previous"
            />

            <NavigationRow
                post={nextPost}
                type="next"
            />
        </nav>
    )
}