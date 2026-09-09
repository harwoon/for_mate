import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
    getNotifications,
    readNotification
} from "../../api/misc.api.js"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Pagination from "../../components/common/Pagination.jsx"

const PAGE_SIZE = 20

function formatDate(value) {
    if (!value) return "-"

    return new Date(value)
        .toLocaleString("ko-KR")
}

function formatSimilarity(value) {
    const score = Number(value)

    if (!Number.isFinite(score)) {
        return "-"
    }

    return `${Math.round(score * 100)}%`
}

export default function NotificationPage() {
    const navigate = useNavigate()

    const [notifications, setNotifications] = useState([])
    const [page, setPage] = useState(1)

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)
    const [readingId, setReadingId] = useState(null)

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

    const startIndex =
        (page - 1) * PAGE_SIZE

    const currentNotifications =
        notifications.slice(
            startIndex,
            startIndex + PAGE_SIZE
        )

    const unreadCount =
        notifications.filter(
            (notification) => (
                !notification.is_read
            )
        ).length

    async function handleNotification(notification) {
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
            if (!notification.is_read) {
                await readNotification(
                    notification.notification_id
                )

                setNotifications((current) => (
                    current.map((item) => (
                        item.notification_id ===
                        notification.notification_id
                            ? {
                                ...item,
                                is_read: true
                            }
                            : item
                    ))
                ))
            }

            navigate(
                `/lost-posts/${notification.lost_post_id}/matches`
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

    return (
        <>
            {!error && (
                <Loading
                    loading={loading}
                    message="알림을 불러오는 중입니다."
                />
            )}

            {!loading && error && (
                <ErrorState
                    message={error}
                    onRetry={() => (
                        setRetryCount(
                            (count) => count + 1
                        )
                    )}
                    onHome={() => navigate("/")}
                />
            )}

            {!error && (
                <div className="container">
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
                                내 실종 공고와 유사한
                                보호동물 매칭 알림을 확인할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <div className="row-between">
                        <span className="text-sub">
                            전체 {notifications.length}건
                        </span>

                        <span className="text-sub">
                            읽지 않은 알림 {unreadCount}건
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

                    {!loading &&
                        notifications.length === 0 && (
                            <Empty message="새로운 알림이 없습니다." />
                        )}

                    {!loading &&
                        currentNotifications.length > 0 && (
                            <>
                                <div className="stack">
                                    {currentNotifications.map(
                                        (notification) => (
                                            <button
                                                key={
                                                    notification.notification_id
                                                }
                                                type="button"
                                                className={
                                                    notification.is_read
                                                        ? "card card-padded"
                                                        : "card card-padded is-unread"
                                                }
                                                onClick={() => (
                                                    handleNotification(
                                                        notification
                                                    )
                                                )}
                                                disabled={
                                                    readingId ===
                                                    notification.notification_id
                                                }
                                            >
                                                <div className="row-between">
                                                    <div className="stack">
                                                        <div className="row">
                                                            {!notification.is_read && (
                                                                <span className="badge">
                                                                    NEW
                                                                </span>
                                                            )}

                                                            <strong>
                                                                {notification.breed ||
                                                                "보호동물"}
                                                            </strong>
                                                        </div>

                                                        <span className="text-sub">
                                                            {notification.region ||
                                                            "지역 정보 없음"}
                                                        </span>

                                                        <span className="text-sub">
                                                            유사도{" "}
                                                            {formatSimilarity(
                                                                notification.similarity_score
                                                            )}
                                                        </span>
                                                    </div>

                                                    <div className="stack">
                                                        <span className="text-sub">
                                                            {formatDate(
                                                                notification.created_at
                                                            )}
                                                        </span>

                                                        <span className="text-sub">
                                                            {notification.is_read
                                                                ? "읽음"
                                                                : "읽지 않음"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </button>
                                        )
                                    )}
                                </div>

                                <Pagination
                                    page={page}
                                    total={
                                        notifications.length
                                    }
                                    size={PAGE_SIZE}
                                    onChange={setPage}
                                />
                            </>
                        )}
                </div>
            )}
        </>
    )
}