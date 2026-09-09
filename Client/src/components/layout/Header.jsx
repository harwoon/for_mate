import {
    useEffect,
    useRef,
    useState
} from "react"
import {
    Link,
    NavLink,
    useNavigate
} from "react-router-dom"
import { useAuth } from "../../context/AuthContext.jsx"
import {
    getNotifications,
    readNotification
} from "../../api/misc.api.js"

// 상단 고정 메뉴. 피그마의 4개 메뉴 구성을 그대로 따른다.
export default function Header() {
    const { user, logout } = useAuth()
    const navigate = useNavigate()

    const notificationRef = useRef(null)

    const [isNotificationOpen, setIsNotificationOpen] =
        useState(false)

    const [notifications, setNotifications] =
        useState([])

    const [notificationLoading, setNotificationLoading] =
        useState(false)

    const [notificationError, setNotificationError] =
        useState("")

    useEffect(() => {
        if (!user) {
            setNotifications([])
            setIsNotificationOpen(false)
            return
        }

        loadNotifications()
    }, [user])

    useEffect(() => {
        function handleOutsideClick(event) {
            if (
                notificationRef.current &&
                !notificationRef.current.contains(
                    event.target
                )
            ) {
                setIsNotificationOpen(false)
            }
        }

        document.addEventListener(
            "mousedown",
            handleOutsideClick
        )

        return () => {
            document.removeEventListener(
                "mousedown",
                handleOutsideClick
            )
        }
    }, [])

    async function loadNotifications() {
        setNotificationLoading(true)
        setNotificationError("")

        try {
            const result =
                await getNotifications()

            setNotifications(
                result?.items ?? []
            )
        } catch (error) {
            setNotificationError(
                error.message ||
                "알림을 불러오지 못했습니다."
            )
        } finally {
            setNotificationLoading(false)
        }
    }

    async function handleToggleNotification() {
        const nextOpen =
            !isNotificationOpen

        setIsNotificationOpen(nextOpen)

        if (nextOpen) {
            await loadNotifications()
        }
    }

    async function handleNotificationClick(
        notification
    ) {
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

            setIsNotificationOpen(false)

            navigate(
                `/lost-posts/${notification.lost_post_id}/matches`
            )
        } catch (error) {
            setNotificationError(
                error.message ||
                "알림 처리에 실패했습니다."
            )
        }
    }

    const unreadCount =
        notifications.filter(
            (notification) => (
                !notification.is_read
            )
        ).length

    const previewNotifications =
        notifications.slice(0, 5)

    return (
        <header className="header">
            <div className="container header-inner">
                <Link
                    to="/"
                    className="header-logo"
                    aria-label="For Mate 홈으로 이동"
                >
                    <img
                        src="/images/LOGO.png"
                        alt="For Mate"
                    />
                </Link>

                <nav className="header-nav">
                    <NavLink to="/lost-posts">
                        찾고있어요
                    </NavLink>

                    <NavLink to="/rescue-animals">
                        보호중이에요
                    </NavLink>

                    <NavLink to="/ai-search">
                        AI로 찾기
                    </NavLink>

                    <NavLink to="/found-posts">
                        발견제보
                    </NavLink>
                </nav>

                <div className="header-actions">
                    {user ? (
                        <>
                            <div
                                className="header-notification"
                                ref={notificationRef}
                            >
                                <button
                                    type="button"
                                    className="header-icon-button"
                                    aria-label="알림"
                                    onClick={handleToggleNotification}
                                >
                                    <i
                                        className="ri-notification-3-line"
                                        aria-hidden="true"
                                    />

                                    {unreadCount > 0 && (
                                        <span className="header-notification-count">
                                            {unreadCount > 9
                                                ? "9+"
                                                : unreadCount}
                                        </span>
                                    )}
                                </button>

                                {isNotificationOpen && (
                                    <div className="notification-dropdown">
                                        <div className="notification-dropdown-header">
                                            <strong>알림</strong>

                                            <span className="text-sub">
                                                읽지 않음 {unreadCount}건
                                            </span>
                                        </div>

                                        {notificationLoading ? (
                                            <div className="notification-dropdown-state">
                                                알림을 불러오는 중입니다.
                                            </div>
                                        ) : notificationError ? (
                                            <div className="notification-dropdown-state">
                                                {notificationError}
                                            </div>
                                        ) : previewNotifications.length === 0 ? (
                                            <div className="notification-dropdown-state">
                                                새로운 알림이 없습니다.
                                            </div>
                                        ) : (
                                            <div className="notification-dropdown-list">
                                                {previewNotifications.map((notification) => (
                                                    <button
                                                        key={notification.notification_id}
                                                        type="button"
                                                        className={
                                                            notification.is_read
                                                                ? "notification-dropdown-item"
                                                                : "notification-dropdown-item is-unread"
                                                        }
                                                        onClick={() => (
                                                            handleNotificationClick(notification)
                                                        )}
                                                    >
                                                        <div className="notification-dropdown-info">
                                                            <div className="notification-dropdown-title">
                                                                {!notification.is_read && (
                                                                    <span className="notification-new-dot" />
                                                                )}

                                                                <strong>
                                                                    {notification.region ||
                                                                        "지역 정보 없음"}
                                                                </strong>

                                                                <span>
                                                                    {notification.breed ||
                                                                        "품종 정보 없음"}
                                                                </span>
                                                            </div>

                                                            <p>
                                                                유사도{" "}
                                                                {Math.round(
                                                                    Number(
                                                                        notification.similarity_score
                                                                    ) * 100
                                                                )}
                                                                %의 보호동물이 등록되었습니다.
                                                            </p>

                                                            <span className="text-sub">
                                                                {String(notification.created_at)
                                                                    .slice(0, 10)
                                                                    .replaceAll("-", ".")}
                                                            </span>
                                                        </div>

                                                        <span className="notification-check-button">
                                                            공고확인
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        <Link
                                            to="/notifications"
                                            className="notification-dropdown-all"
                                            onClick={() => setIsNotificationOpen(false)}
                                        >
                                            전체 알림 보기
                                        </Link>
                                    </div>
                                )}
                            </div>

                            <Link
                                to="/mypage"
                                className="header-icon-button"
                                aria-label="마이페이지"
                                title="마이페이지"
                            >
                                <i
                                    className="ri-user-line"
                                    aria-hidden="true"
                                />
                            </Link>
                        </>
                    ) : (
                        <Link
                            to="/login"
                            className="btn btn-primary btn-sm"
                        >
                            로그인
                        </Link>
                    )}
                </div>
            </div>
        </header>
    )
}