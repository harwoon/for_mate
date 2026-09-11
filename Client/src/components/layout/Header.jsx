import { formatTimestampDate } from "../../utils/date.js"
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
    addBookmark,
    getBookmarks,
    getNotifications,
    readNotification,
    readAllNotifications,
    removeBookmark
} from "../../api/misc.api.js"

const HIDDEN_NOTIFICATION_KEY = "for-mate-hidden-notifications"

function getHiddenNotificationKey(userId) {
    return `${HIDDEN_NOTIFICATION_KEY}:${String(userId)}`
}

function readHiddenNotificationIds(userId) {
    if (!userId) return []

    try {
        const value = localStorage.getItem(
            getHiddenNotificationKey(userId)
        )

        if (!value) return []

        const ids = JSON.parse(value)

        if (!Array.isArray(ids)) {
            return []
        }

        return ids.map(String)
    } catch {
        return []
    }
}

function saveHiddenNotificationIds(
    userId,
    ids
) {
    if (!userId) return

    try {
        localStorage.setItem(
            getHiddenNotificationKey(userId),
            JSON.stringify(ids)
        )
    } catch {
        // localStorage를 사용할 수 없는 환경에서는
        // 현재 화면 상태만 유지한다.
    }
}

// 상단 고정 메뉴. 피그마의 4개 메뉴 구성을 그대로 따른다.
export default function Header() {
    const { user } = useAuth()
    const navigate = useNavigate()

    const notificationRef = useRef(null)

    const [isNotificationOpen, setIsNotificationOpen] =
        useState(false)

    const [notifications, setNotifications] =
        useState([])

    const [bookmarks, setBookmarks] = useState([])

    const [hiddenNotificationIds, setHiddenNotificationIds] = useState([])

    const [notificationLoading, setNotificationLoading] = useState(false)

    const [notificationError, setNotificationError] =
        useState("")

    const [bookmarkingId, setBookmarkingId] = useState(null)

    const [readingId, setReadingId] = useState(null)

    const [readingAll, setReadingAll] = useState(false)

    useEffect(() => {
        if (!user) {
            setNotifications([])
            setBookmarks([])
            setHiddenNotificationIds([])
            setIsNotificationOpen(false)
            return
        }

        setHiddenNotificationIds(
            readHiddenNotificationIds(user.id)
        )

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

        window.addEventListener(
            "notifications:read",
            handleReadNotification
        )

        return () => {
            window.removeEventListener(
                "notifications:read",
                handleReadNotification
            )
        }
    }, [])

    async function loadNotifications() {
        setNotificationLoading(true)
        setNotificationError("")

        try {
            const [
                notificationResult,
                bookmarkResult
            ] = await Promise.all([
                getNotifications(),
                getBookmarks()
            ])

            setNotifications(
                notificationResult?.items ?? []
            )

            setBookmarks(
                bookmarkResult?.items ?? []
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

    function getNotificationAnimalId(
        notification
    ) {
        if (notification.animal_id) {
            return notification.animal_id
        }

        return notification.source_type ===
            "pawinhand"
            ? notification.pawinhand_animal_id
            : notification.desertion_no
    }

    function findNotificationBookmark(
        notification
    ) {
        const animalId =
            getNotificationAnimalId(
                notification
            )

        return bookmarks.find(
            (bookmark) =>
                bookmark.source_type ===
                    notification.source_type &&
                String(bookmark.animal_id) ===
                    String(animalId)
        )
    }

    async function handleNotificationClick(
        notification
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
        setNotificationError("")

        try {
            if (!notification.is_read) {
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

            setIsNotificationOpen(false)

            const animalId =
                getNotificationAnimalId(
                    notification
                )

            navigate(
                `/rescue-animals/${notification.source_type}/${animalId}`
            )
        } catch (error) {
            setNotificationError(
                error.message ||
                "알림 처리에 실패했습니다."
            )
        } finally {
            setReadingId(null)
        }
    }

    async function handleBookmarkClick(
        notification
    ) {
        if (
            bookmarkingId ===
            notification.notification_id
        ) {
            return
        }

        setBookmarkingId(
            notification.notification_id
        )
        setNotificationError("")

        try {
            const animalId =
                getNotificationAnimalId(
                    notification
                )

            const bookmark =
                findNotificationBookmark(
                    notification
                )

            if (bookmark) {
                await removeBookmark(
                    bookmark.bookmark_id
                )

                setBookmarks((current) =>
                    current.filter(
                        (item) =>
                            String(
                                item.bookmark_id
                            ) !==
                            String(
                                bookmark.bookmark_id
                            )
                    )
                )

                return
            }

            const result =
                await addBookmark({
                    source_type:
                        notification.source_type,
                    animal_id: animalId
                })

            setBookmarks((current) => [
                ...current,
                {
                    bookmark_id:
                        result.bookmark_id,
                    source_type:
                        notification.source_type,
                    animal_id: animalId
                }
            ])
        } catch (error) {
            setNotificationError(
                error.message ||
                "북마크 처리에 실패했습니다."
            )
        } finally {
            setBookmarkingId(null)
        }
    }

    async function handleHideNotification(
        notification
    ) {
        const notificationId =
            String(
                notification.notification_id
            )

        setNotificationError("")

        try {
            if (!notification.is_read) {
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

                window.dispatchEvent(
                    new CustomEvent(
                        "notifications:read",
                        {
                            detail: {
                                notificationId
                            }
                        }
                    )
                )
            }

            setHiddenNotificationIds(
                (current) => {
                    if (
                        current.includes(
                            notificationId
                        )
                    ) {
                        return current
                    }

                    const next = [
                        ...current,
                        notificationId
                    ]

                    saveHiddenNotificationIds(
                        user?.id,
                        next
                    )

                    return next
                }
            )
        } catch (error) {
            setNotificationError(
                error.message ||
                "알림 처리에 실패했습니다."
            )
        }
    }

    async function handleReadAllNotifications() {
        if (
            readingAll ||
            unreadCount === 0
        ) {
            return
        }

        setReadingAll(true)
        setNotificationError("")

        try {
            await readAllNotifications()

            setNotifications((current) =>
                current.map((notification) => ({
                    ...notification,
                    is_read: true
                }))
            )

            window.dispatchEvent(
                new Event(
                    "notifications:read-all"
                )
            )
        } catch (error) {
            setNotificationError(
                error.message ||
                "모두 읽음 처리에 실패했습니다."
            )
        } finally {
            setReadingAll(false)
        }
    }

    const visibleNotifications =
        notifications.filter(
            (notification) =>
                !hiddenNotificationIds.includes(
                    String(
                        notification.notification_id
                    )
                )
        )

    const unreadCount =
        visibleNotifications.filter(
            (notification) =>
                !notification.is_read
        ).length

    const previewNotifications =
        visibleNotifications.slice(0, 5)

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
                                    className={
                                        unreadCount > 0
                                            ? "header-icon-button has-notification"
                                            : "header-icon-button"
                                    }
                                    aria-label="알림"
                                    onClick={
                                        handleToggleNotification
                                    }
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
                                            
                                            <div className="notification-dropdown-header-actions">
                                                <span className="text-sub">
                                                    읽지 않음{" "}
                                                    {unreadCount}건
                                                </span>

                                                {unreadCount > 0 && (
                                                    <button
                                                        type="button"
                                                        className="notification-read-all-button"
                                                        disabled={readingAll}
                                                        onClick={
                                                            handleReadAllNotifications
                                                        }
                                                    >
                                                        {readingAll
                                                            ? "처리 중"
                                                            : "모두 읽음"}
                                                    </button>
                                                )}
                                            </div>
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
                                                {previewNotifications.map(
                                                    (
                                                        notification
                                                    ) => {
                                                        const bookmark =
                                                            findNotificationBookmark(
                                                                notification
                                                            )

                                                        const isBookmarking =
                                                            bookmarkingId ===
                                                            notification.notification_id

                                                        const isReading =
                                                            readingId ===
                                                            notification.notification_id

                                                        return (
                                                            <div
                                                                key={
                                                                    notification.notification_id
                                                                }
                                                                className={
                                                                    notification.is_read
                                                                        ? "notification-dropdown-item"
                                                                        : "notification-dropdown-item is-unread"
                                                                }
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
                                                                            ) *
                                                                                100
                                                                        )}
                                                                        %의 보호동물이 등록되었습니다.
                                                                    </p>

                                                                    <span className="text-sub">
                                                                        {formatTimestampDate(
                                                                            notification.created_at
                                                                        )}
                                                                    </span>
                                                                </div>

                                                                <div className="notification-dropdown-actions">
                                                                    <div className="notification-dropdown-icon-actions">
                                                                        <button
                                                                            type="button"
                                                                            className={
                                                                                bookmark
                                                                                    ? "notification-action-icon is-bookmarked"
                                                                                    : "notification-action-icon"
                                                                            }
                                                                            aria-label={
                                                                                bookmark
                                                                                    ? "북마크 해제"
                                                                                    : "북마크"
                                                                            }
                                                                            title={
                                                                                bookmark
                                                                                    ? "북마크 해제"
                                                                                    : "북마크"
                                                                            }
                                                                            disabled={
                                                                                isBookmarking
                                                                            }
                                                                            onClick={() =>
                                                                                handleBookmarkClick(
                                                                                    notification
                                                                                )
                                                                            }
                                                                        >
                                                                            <i
                                                                                className={
                                                                                    bookmark
                                                                                        ? "ri-bookmark-fill"
                                                                                        : "ri-bookmark-line"
                                                                                }
                                                                                aria-hidden="true"
                                                                            />
                                                                        </button>

                                                                        <button
                                                                            type="button"
                                                                            className="notification-action-icon is-delete"
                                                                            aria-label="알림창에서 숨기기"
                                                                            title="알림창에서 숨기기"
                                                                            onClick={() =>
                                                                                handleHideNotification(
                                                                                    notification
                                                                                )
                                                                            }
                                                                        >
                                                                            <i
                                                                                className="ri-close-line"
                                                                                aria-hidden="true"
                                                                            />
                                                                        </button>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        className="notification-check-button"
                                                                        disabled={
                                                                            isReading
                                                                        }
                                                                        onClick={() =>
                                                                            handleNotificationClick(
                                                                                notification
                                                                            )
                                                                        }
                                                                    >
                                                                        공고확인
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        )
                                                    }
                                                )}
                                            </div>
                                        )}

                                        <Link
                                            to="/notifications"
                                            className="notification-dropdown-all"
                                            onClick={() =>
                                                setIsNotificationOpen(
                                                    false
                                                )
                                            }
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
                            className="header-login-button"
                        >
                            <i
                                className="ri-user-line"
                                aria-hidden="true"
                            />

                            <span>
                                Login
                            </span>
                        </Link>
                    )}
                </div>
            </div>
        </header>
    )
}