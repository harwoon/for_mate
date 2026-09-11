import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import {
    getNotifications,
    readNotification
} from "../../api/misc.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"
import {
    formatDateTime,
    formatRelativeTime
} from "../../utils/date.js"

const PAGE_SIZE = 10

const SOURCE_LABELS = {
    rescue: "공공데이터",
    pawinhand: "포인핸드"
}

function formatSimilarity(value) {
    const score = Number(value)

    if (!Number.isFinite(score)) {
        return "-"
    }

    return `${(score * 100).toFixed(1)}%`
}

function getAnimalId(notification) {
    if (notification.animal_id) {
        return notification.animal_id
    }

    return notification.source_type === "pawinhand"
        ? notification.pawinhand_animal_id
        : notification.desertion_no
}

export default function NotificationPage() {
    const navigate = useNavigate()

    const [notifications, setNotifications] = useState([])
    const [filter, setFilter] = useState("all")
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [readingId, setReadingId] = useState(null)
    const [failedImages, setFailedImages] = useState({})

    useEffect(() => {
        let cancelled = false

        async function loadNotifications() {
            setLoading(true)
            setError("")

            try {
                const result = await getNotifications()

                if (cancelled) return

                setNotifications(
                    result?.items ?? []
                )
            } catch (error) {
                if (!cancelled) {
                    setNotifications([])
                    setError(
                        error.message ||
                        "알림을 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadNotifications()

        return () => {
            cancelled = true
        }
    }, [retryCount])

    useEffect(() => {
        setPage(1)
    }, [filter])

    useEffect(() => {
        function handleReadNotification(event) {
            const notificationId =
                event.detail?.notificationId

            if (!notificationId) return

            setNotifications((current) =>
                current.map((notification) =>
                    String(
                        notification.notification_id
                    ) === String(notificationId)
                        ? {
                            ...notification,
                            is_read: true
                        }
                        : notification
                )
            )
        }

        function handleReadAllNotifications() {
            setNotifications((current) =>
                current.map((notification) => ({
                    ...notification,
                    is_read: true
                }))
            )
        }

        window.addEventListener(
            "notifications:read",
            handleReadNotification
        )

        window.addEventListener(
            "notifications:read-all",
            handleReadAllNotifications
        )

        return () => {
            window.removeEventListener(
                "notifications:read",
                handleReadNotification
            )

            window.removeEventListener(
                "notifications:read-all",
                handleReadAllNotifications
            )
        }
    }, [])

    const unreadCount = notifications.filter(
        (notification) => !notification.is_read
    ).length

    const filteredNotifications =
        filter === "unread"
            ? notifications.filter(
                (notification) =>
                    !notification.is_read
            )
            : notifications

    const startIndex =
        (page - 1) * PAGE_SIZE

    const currentNotifications =
        filteredNotifications.slice(
            startIndex,
            startIndex + PAGE_SIZE
        )

    async function markNotificationAsRead(
        notification
    ) {
        if (notification.is_read) return

        await readNotification(
            notification.notification_id
        )

        setNotifications((current) =>
            current.map((item) =>
                item.notification_id ===
                notification.notification_id
                    ? {
                        ...item,
                        is_read: true
                    }
                    : item
            )
        )
    }

    async function handleNotification(
        notification,
        destination
    ) {
        if (
            readingId ===
            notification.notification_id
        ) {
            return
        }

        setReadingId(
            notification.notification_id
        )
        setActionError("")

        try {
            await markNotificationAsRead(
                notification
            )

            if (destination === "matches") {
                navigate(
                    `/lost-posts/${notification.lost_post_id}/matches`
                )
                return
            }

            const animalId =
                getAnimalId(notification)

            navigate(
                `/rescue-animals/${notification.source_type}/${animalId}`
            )
        } catch (error) {
            setActionError(
                error.message ||
                "알림 처리에 실패했습니다."
            )
        } finally {
            setReadingId(null)
        }
    }

    if (loading) {
        return (
            <Loading message="알림을 불러오는 중입니다." />
        )
    }

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() =>
                    setRetryCount(
                        (count) => count + 1
                    )
                }
                onHome={() => navigate("/")}
            />
        )
    }

    return (
        <div className="container notification-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "마이페이지",
                        to: "/mypage"
                    },
                    {
                        label: "알림"
                    }
                ]}
            />

            <div className="page-header">
                <div>
                    <h1 className="page-title">
                        알림
                    </h1>

                    <p className="page-desc">
                        내 실종동물과 유사한 보호동물이
                        새로 등록되면 알려드립니다.
                    </p>
                </div>
            </div>

            <section className="card notification-summary">
                <div>
                    <span>
                        전체 알림
                    </span>

                    <strong>
                        {notifications.length}
                        <small>건</small>
                    </strong>
                </div>

                <div>
                    <span>
                        읽지 않은 알림
                    </span>

                    <strong>
                        {unreadCount}
                        <small>건</small>
                    </strong>
                </div>
            </section>

            <div className="notification-toolbar">
                <div className="notification-tabs">
                    <button
                        type="button"
                        className={
                            filter === "all"
                                ? "notification-tab is-active"
                                : "notification-tab"
                        }
                        onClick={() =>
                            setFilter("all")
                        }
                    >
                        전체
                        <span>
                            {notifications.length}
                        </span>
                    </button>

                    <button
                        type="button"
                        className={
                            filter === "unread"
                                ? "notification-tab is-active"
                                : "notification-tab"
                        }
                        onClick={() =>
                            setFilter("unread")
                        }
                    >
                        읽지 않음
                        <span>
                            {unreadCount}
                        </span>
                    </button>
                </div>

                <span className="text-sub">
                    총 {filteredNotifications.length}건
                </span>
            </div>

            {actionError && (
                <p
                    className="form-error"
                    role="alert"
                >
                    {actionError}
                </p>
            )}

            {filteredNotifications.length === 0 ? (
                <Empty
                    message={
                        filter === "unread"
                            ? "읽지 않은 알림이 없습니다."
                            : "새로운 알림이 없습니다."
                    }
                />
            ) : (
                <>
                    <div className="notification-list">
                        {currentNotifications.map(
                            (notification) => {
                                const sourceLabel =
                                    SOURCE_LABELS[
                                        notification.source_type
                                    ] ||
                                    "보호동물 데이터"

                                const petName =
                                    notification.pet_name ||
                                    "등록한 실종동물"

                                const breed =
                                    notification.breed ||
                                    "보호동물"

                                const busy =
                                    readingId ===
                                    notification.notification_id

                                return (
                                    <article
                                        key={
                                            notification.notification_id
                                        }
                                        className={
                                            notification.is_read
                                                ? "card notification-item"
                                                : "card notification-item is-unread"
                                        }
                                    >
                                        <div className="notification-image">
                                            {notification.thumbnail_url &&
                                            !failedImages[
                                                notification.notification_id
                                            ] ? (
                                                <img
                                                    src={imageUrl(
                                                        notification.thumbnail_url
                                                    )}
                                                    alt={`${breed} 사진`}
                                                    onError={() =>
                                                        setFailedImages(
                                                            (current) => ({
                                                                ...current,
                                                                [notification.notification_id]: true
                                                            })
                                                        )
                                                    }
                                                />
                                            ) : (
                                                <div className="notification-image-empty">
                                                    <i
                                                        className="ri-image-line"
                                                        aria-hidden="true"
                                                    />
                                                </div>
                                            )}

                                            {!notification.is_read && (
                                                <span className="notification-unread-dot" />
                                            )}
                                        </div>

                                        <div className="notification-content">
                                            <div className="notification-item-top">
                                                <div className="notification-badges">
                                                    <span className="notification-source-badge">
                                                        {sourceLabel}
                                                    </span>

                                                    {!notification.is_read && (
                                                        <span className="notification-new-badge">
                                                            NEW
                                                        </span>
                                                    )}
                                                </div>

                                                <span
                                                    className="notification-time"
                                                    title={formatDateTime(
                                                        notification.created_at
                                                    )}
                                                >
                                                    {formatRelativeTime(
                                                        notification.created_at
                                                    )}
                                                </span>
                                            </div>

                                            <h2>
                                                {petName}와 유사한 보호동물이
                                                등록되었습니다.
                                            </h2>

                                            <div className="notification-meta">
                                                <span>
                                                    <i
                                                        className="ri-information-line"
                                                        aria-hidden="true"
                                                    />
                                                    {breed}
                                                </span>

                                                <span>
                                                    <i
                                                        className="ri-map-pin-line"
                                                        aria-hidden="true"
                                                    />
                                                    {notification.region ||
                                                        "지역 정보 없음"}
                                                </span>
                                            </div>

                                            <div className="notification-similarity">
                                                <span>
                                                    AI 이미지 유사도
                                                </span>

                                                <strong>
                                                    {formatSimilarity(
                                                        notification.similarity_score
                                                    )}
                                                </strong>
                                            </div>
                                        </div>

                                        <div className="notification-actions">
                                            <button
                                                type="button"
                                                className="btn btn-outline"
                                                disabled={busy}
                                                onClick={() =>
                                                    handleNotification(
                                                        notification,
                                                        "animal"
                                                    )
                                                }
                                            >
                                                보호동물 보기
                                            </button>

                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                disabled={busy}
                                                onClick={() =>
                                                    handleNotification(
                                                        notification,
                                                        "matches"
                                                    )
                                                }
                                            >
                                                AI 매칭 결과
                                            </button>
                                        </div>
                                    </article>
                                )
                            }
                        )}
                    </div>

                    <Pagination
                        page={page}
                        total={
                            filteredNotifications.length
                        }
                        size={PAGE_SIZE}
                        onChange={setPage}
                    />
                </>
            )}
        </div>
    )
}