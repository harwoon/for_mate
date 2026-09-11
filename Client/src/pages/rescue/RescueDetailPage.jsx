import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import {
    getAnimalBySource,
    getRescueAnimal
} from "../../api/rescueAnimals.api.js"
import {
    addBookmark,
    getBookmarks,
    removeBookmark
} from "../../api/misc.api.js"
import Badge from "../../components/common/Badge.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import PostNavigation from "../../components/common/PostNavigation.jsx"
import { formatDate } from "../../utils/date.js"

const SEX_LABELS = {
    M: "수컷",
    F: "암컷",
    Q: "미상",
    U: "미상"
}

const NEUTER_LABELS = {
    Y: "중성화 완료",
    N: "중성화 안 됨",
    U: "미상"
}

const SOURCE_LABELS = {
    rescue: "공공데이터",
    pawinhand: "포인핸드"
}

function displayValue(value) {
    return value || "정보 없음"
}

function displayColors(value) {
    if (!value) return "정보 없음"

    if (Array.isArray(value)) {
        return value.filter(Boolean).join(", ") || "정보 없음"
    }

    return String(value)
        .split(",")
        .map((color) => color.trim())
        .filter(Boolean)
        .join(", ")
}

function isEndingSoon(daysUntilEnd) {
    const days = Number(daysUntilEnd)

    return (
        Number.isFinite(days) &&
        days >= 0 &&
        days <= 3
    )
}

function getRemainingLabel(daysUntilEnd) {
    const days = Number(daysUntilEnd)

    if (!Number.isFinite(days)) {
        return "남은 기간 정보 없음"
    }

    if (days === 0) {
        return "오늘 보호 종료 예정"
    }

    return `보호 종료까지 D-${days}`
}

export default function RescueDetailPage() {
    const {
        sourceType,
        animalId,
        desertionNo
    } = useParams()

    const navigate = useNavigate()

    const [animal, setAnimal] = useState(null)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)
    const [failedImages, setFailedImages] = useState({})

    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [actionError, setActionError] = useState("")
    const [retryCount, setRetryCount] = useState(0)

    const [bookmarkId, setBookmarkId] = useState(null)
    const [bookmarking, setBookmarking] = useState(false)

    useEffect(() => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        })
    }, [
        sourceType,
        animalId,
        desertionNo
    ])

    useEffect(() => {
        let cancelled = false

        async function loadAnimal() {
            setLoading(true)
            setError("")

            try {
                const result =
                    sourceType && animalId
                        ? await getAnimalBySource(
                            sourceType,
                            animalId
                        )
                        : await getRescueAnimal(
                            desertionNo
                        )

                if (cancelled) return

                setAnimal(result)
                setCurrentImageIndex(0)
                setFailedImages({})
                setBookmarkId(null)
            } catch (error) {
                if (!cancelled) {
                    setAnimal(null)
                    setError(
                        error.message ||
                        "보호동물 정보를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadAnimal()

        return () => {
            cancelled = true
        }
    }, [
        sourceType,
        animalId,
        desertionNo,
        retryCount
    ])

    const images = animal?.images ?? []
    const currentImage = images[currentImageIndex]

    const endingSoon = isEndingSoon(
        animal?.days_until_end
    )

    const currentSource =
        animal?.source_type ||
        sourceType ||
        "rescue"

    const currentAnimalId =
        animal?.animal_id ||
        animalId ||
        desertionNo

    function handlePreviousImage() {
        if (images.length < 2) return

        setCurrentImageIndex((index) => (
            index === 0
                ? images.length - 1
                : index - 1
        ))
    }

    function handleNextImage() {
        if (images.length < 2) return

        setCurrentImageIndex((index) => (
            index === images.length - 1
                ? 0
                : index + 1
        ))
    }

    async function findBookmarkId() {
        if (bookmarkId) {
            return bookmarkId
        }

        const result = await getBookmarks()

        const bookmark = result?.items?.find(
            (item) => (
                item.source_type === currentSource &&
                String(item.animal_id) ===
                    String(currentAnimalId)
            )
        )

        return bookmark?.bookmark_id || null
    }

    async function handleBookmark() {
        if (!animal || bookmarking) return

        setBookmarking(true)
        setActionError("")

        try {
            if (!animal.is_bookmarked) {
                const result = await addBookmark({
                    source_type: currentSource,
                    animal_id: currentAnimalId
                })

                setBookmarkId(
                    result?.bookmark_id ?? null
                )

                setAnimal((current) => ({
                    ...current,
                    is_bookmarked: true
                }))

                return
            }

            const currentBookmarkId =
                await findBookmarkId()

            if (!currentBookmarkId) {
                throw new Error(
                    "북마크 정보를 찾을 수 없습니다."
                )
            }

            await removeBookmark(
                currentBookmarkId
            )

            setBookmarkId(null)

            setAnimal((current) => ({
                ...current,
                is_bookmarked: false
            }))
        } catch (error) {
            setActionError(
                error.message ||
                "북마크 처리에 실패했습니다."
            )
        } finally {
            setBookmarking(false)
        }
    }

    if (loading) {
        return (
            <Loading message="보호동물 정보를 불러오는 중입니다." />
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

    if (!animal) {
        return (
            <Empty message="보호동물 정보를 찾을 수 없습니다." />
        )
    }

    const currentImageFailed =
        currentImage &&
        failedImages[currentImageIndex]

    return (
        <div className="container rescue-detail-page">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "보호중이에요",
                        to: "/rescue-animals"
                    },
                    {
                        label: "상세"
                    }
                ]}
            />

            <div className="page-header rescue-detail-header">
                <div>
                    <h1 className="page-title">
                        보호동물 상세
                    </h1>

                    <p className="page-desc">
                        보호 중인 동물의 정보와 보호소 정보를 확인해주세요.
                    </p>
                </div>

                <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() =>
                        navigate("/rescue-animals")
                    }
                >
                    <i
                        className="ri-arrow-left-line"
                        aria-hidden="true"
                    />
                    목록으로
                </button>
            </div>

            {endingSoon && (
                <div className="rescue-ending-alert">
                    <i
                        className="ri-alarm-warning-line"
                        aria-hidden="true"
                    />

                    <div>
                        <strong>
                            {getRemainingLabel(
                                animal.days_until_end
                            )}
                        </strong>

                        <p>
                            관심 있는 동물이라면 보호소에
                            공고 상태를 확인해주세요.
                        </p>
                    </div>
                </div>
            )}

            <section className="rescue-detail-layout">
                <div className="rescue-detail-gallery">
                    <div className="rescue-detail-main-image">
                        {currentImage && !currentImageFailed ? (
                            <img
                                src={imageUrl(currentImage)}
                                alt={`${animal.breed || animal.species || "보호동물"} 사진 ${currentImageIndex + 1}`}
                                onError={() =>
                                    setFailedImages(
                                        (current) => ({
                                            ...current,
                                            [currentImageIndex]: true
                                        })
                                    )
                                }
                            />
                        ) : (
                            <div className="rescue-detail-image-empty">
                                <i
                                    className="ri-image-line"
                                    aria-hidden="true"
                                />

                                <span>
                                    등록된 사진이 없습니다.
                                </span>
                            </div>
                        )}

                        {images.length > 1 && (
                            <>
                                <button
                                    type="button"
                                    className="rescue-detail-image-arrow is-prev"
                                    onClick={handlePreviousImage}
                                    aria-label="이전 사진"
                                >
                                    <i
                                        className="ri-arrow-left-s-line"
                                        aria-hidden="true"
                                    />
                                </button>

                                <button
                                    type="button"
                                    className="rescue-detail-image-arrow is-next"
                                    onClick={handleNextImage}
                                    aria-label="다음 사진"
                                >
                                    <i
                                        className="ri-arrow-right-s-line"
                                        aria-hidden="true"
                                    />
                                </button>

                                <span className="rescue-detail-image-count">
                                    {currentImageIndex + 1} / {images.length}
                                </span>
                            </>
                        )}
                    </div>

                    {images.length > 1 && (
                        <div className="rescue-detail-thumbnails">
                            {images.map((image, index) => (
                                <button
                                    key={`${image}-${index}`}
                                    type="button"
                                    className={
                                        index === currentImageIndex
                                            ? "rescue-detail-thumbnail is-active"
                                            : "rescue-detail-thumbnail"
                                    }
                                    onClick={() =>
                                        setCurrentImageIndex(index)
                                    }
                                    aria-label={`${index + 1}번째 사진 보기`}
                                >
                                    {!failedImages[index] ? (
                                        <img
                                            src={imageUrl(image)}
                                            alt=""
                                            onError={() =>
                                                setFailedImages(
                                                    (current) => ({
                                                        ...current,
                                                        [index]: true
                                                    })
                                                )
                                            }
                                        />
                                    ) : (
                                        <span>
                                            <i
                                                className="ri-image-line"
                                                aria-hidden="true"
                                            />
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <article className="card card-padded rescue-detail-info">
                    <div className="rescue-detail-info-top">
                        <div className="rescue-detail-status-row">
                            <div className="rescue-detail-badges">
                                <Badge
                                    type={
                                        endingSoon
                                            ? "ending"
                                            : "rescue"
                                    }
                                >
                                    {endingSoon
                                        ? "보호종료 예정"
                                        : "보호중"}
                                </Badge>

                                <span className="rescue-source-badge">
                                    {SOURCE_LABELS[
                                        currentSource
                                    ] || "보호동물 데이터"}
                                </span>
                            </div>

                            <button
                                type="button"
                                className={
                                    animal.is_bookmarked
                                        ? "btn btn-primary"
                                        : "btn btn-outline"
                                }
                                onClick={handleBookmark}
                                disabled={bookmarking}
                            >
                                <i
                                    className={
                                        animal.is_bookmarked
                                            ? "ri-bookmark-fill"
                                            : "ri-bookmark-line"
                                    }
                                    aria-hidden="true"
                                />

                                {bookmarking
                                    ? "처리 중..."
                                    : animal.is_bookmarked
                                        ? "북마크됨"
                                        : "북마크"}
                            </button>
                        </div>

                        <h2>
                            {displayValue(
                                animal.breed
                            )}
                        </h2>

                        <p className="rescue-detail-subtitle">
                            {displayValue(
                                animal.species
                            )}
                            {animal.color_tags ||
                            animal.color
                                ? ` · ${displayColors(
                                    animal.color_tags ||
                                    animal.color
                                )}`
                                : ""}
                        </p>
                    </div>

                    <dl className="rescue-detail-meta">
                        <div>
                            <dt>
                                <i
                                    className="ri-shapes-line"
                                    aria-hidden="true"
                                />
                                종류
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.species
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-information-line"
                                    aria-hidden="true"
                                />
                                품종
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.breed
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-palette-line"
                                    aria-hidden="true"
                                />
                                색상
                            </dt>

                            <dd>
                                {displayColors(
                                    animal.color_tags ||
                                    animal.color
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-user-line"
                                    aria-hidden="true"
                                />
                                성별
                            </dt>

                            <dd>
                                {SEX_LABELS[
                                    animal.sex
                                ] || "정보 없음"}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-heart-pulse-line"
                                    aria-hidden="true"
                                />
                                중성화
                            </dt>

                            <dd>
                                {NEUTER_LABELS[
                                    animal.neuter_yn
                                ] || "정보 없음"}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-time-line"
                                    aria-hidden="true"
                                />
                                나이
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.age
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-scales-3-line"
                                    aria-hidden="true"
                                />
                                체중
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.weight
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-map-pin-line"
                                    aria-hidden="true"
                                />
                                발견 장소
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.happen_place
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-calendar-line"
                                    aria-hidden="true"
                                />
                                발견 날짜
                            </dt>

                            <dd>
                                {formatDate(
                                    animal.happen_dt,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>
                    </dl>

                    <div className="rescue-detail-special">
                        <h3>
                            특이사항
                        </h3>

                        <p>
                            {displayValue(
                                animal.special_mark
                            )}
                        </p>
                    </div>

                    {actionError && (
                        <p
                            className="form-error"
                            role="alert"
                        >
                            {actionError}
                        </p>
                    )}
                </article>
            </section>

            <section className="rescue-detail-bottom-grid">
                <article className="card card-padded rescue-notice-card">
                    <div className="rescue-section-heading">
                        <div>
                            <h2>
                                보호 공고
                            </h2>

                            <p className="text-sub">
                                현재 공고 기간을 확인해주세요.
                            </p>
                        </div>

                        {endingSoon && (
                            <span className="rescue-days-badge">
                                {getRemainingLabel(
                                    animal.days_until_end
                                )}
                            </span>
                        )}
                    </div>

                    <dl className="rescue-info-list">
                        <div>
                            <dt>공고 시작일</dt>
                            <dd>
                                {formatDate(
                                    animal.notice_start_date,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>공고 종료일</dt>
                            <dd>
                                {formatDate(
                                    animal.notice_end_date,
                                    "정보 없음"
                                )}
                            </dd>
                        </div>

                        {animal.notice_no && (
                            <div>
                                <dt>공고번호</dt>
                                <dd>
                                    {animal.notice_no}
                                </dd>
                            </div>
                        )}

                        {animal.process_state && (
                            <div>
                                <dt>상태</dt>
                                <dd>
                                    {animal.process_state}
                                </dd>
                            </div>
                        )}
                    </dl>
                </article>

                <article className="card card-padded rescue-shelter-card">
                    <div className="rescue-section-heading">
                        <div>
                            <h2>
                                보호소 정보
                            </h2>

                            <p className="text-sub">
                                보호 상태와 문의 사항은 보호소에서 확인할 수 있습니다.
                            </p>
                        </div>
                    </div>

                    <dl className="rescue-info-list">
                        <div>
                            <dt>
                                <i
                                    className="ri-home-heart-line"
                                    aria-hidden="true"
                                />
                                보호소명
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.care_name
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-phone-line"
                                    aria-hidden="true"
                                />
                                연락처
                            </dt>

                            <dd>
                                {animal.care_tel ? (
                                    <a
                                        href={`tel:${animal.care_tel}`}
                                        className="rescue-contact-link"
                                    >
                                        {animal.care_tel}
                                    </a>
                                ) : (
                                    "정보 없음"
                                )}
                            </dd>
                        </div>

                        <div>
                            <dt>
                                <i
                                    className="ri-map-pin-2-line"
                                    aria-hidden="true"
                                />
                                주소
                            </dt>

                            <dd>
                                {displayValue(
                                    animal.care_addr
                                )}
                            </dd>
                        </div>
                    </dl>

                    {animal.detail_url && (
                        <a
                            className="btn btn-outline rescue-original-link"
                            href={animal.detail_url}
                            target="_blank"
                            rel="noreferrer"
                        >
                            원문 공고 보기
                            <i
                                className="ri-external-link-line"
                                aria-hidden="true"
                            />
                        </a>
                    )}
                </article>
            </section>

            <PostNavigation
                previousPost={animal.previous_post}
                nextPost={animal.next_post}
                getPath={(post) => (
                    `/rescue-animals/${post.source_type}/${post.animal_id}`
                )}
                getTitle={(post) => (
                    `${post.breed || post.species || "보호동물"} · ${post.happen_place || "지역 정보 없음"}`
                )}
                getDate={(post) =>
                    post.happen_dt
                }
            />
        </div>
    )
}