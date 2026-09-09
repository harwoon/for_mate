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

const SEX_LABELS = {
    M: "수컷",
    F: "암컷",
    Q: "미상"
}

const NEUTER_LABELS = {
    Y: "중성화 완료",
    N: "중성화 안 됨",
    U: "미상"
}

function displayValue(value) {
    return value || "정보 없음"
}

function displayColors(value) {
    if (!value) return "정보 없음"

    if (Array.isArray(value)) {
        return value.join(", ")
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

export default function RescueDetailPage() {
    const {
        sourceType,
        animalId,
        desertionNo
    } = useParams()

    const navigate = useNavigate()

    const [animal, setAnimal] = useState(null)
    const [currentImageIndex, setCurrentImageIndex] = useState(0)

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
                setBookmarkId(null)
            } catch (error) {
                if (!cancelled) {
                    setAnimal(null)

                    setError(
                        error.message ||
                        "구조동물 정보를 불러오지 못했습니다."
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
    const currentImage =
        images[currentImageIndex]

    const endingSoon =
        isEndingSoon(
            animal?.days_until_end
        )

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

        const source =
            animal.source_type ||
            sourceType ||
            "rescue"

        const id =
            String(
                animal.animal_id ||
                animalId ||
                desertionNo
            )

        const bookmark = result?.items?.find(
            (item) => (
                item.source_type === source &&
                String(item.animal_id) === id
            )
        )

        return bookmark?.bookmark_id || null
    }

    async function handleBookmark() {
        if (!animal || bookmarking) return

        setBookmarking(true)
        setActionError("")

        try {
            const source =
                animal.source_type ||
                sourceType ||
                "rescue"

            const id =
                animal.animal_id ||
                animalId ||
                desertionNo

            if (!animal.is_bookmarked) {
                const result = await addBookmark({
                    source_type: source,
                    animal_id: id
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

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => (
                    setRetryCount(
                        (count) => count + 1
                    )
                )}
                onHome={() => navigate("/")}
            />
        )
    }

    if (!loading && !animal) {
        return (
            <Empty message="구조동물 정보를 찾을 수 없습니다." />
        )
    }

    return (
        <>
            <Loading
                loading={loading}
                message="구조동물 정보를 불러오는 중입니다."
            />

            {animal && (
                <div className="container">
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

                    <div className="page-header">
                        <h1 className="page-title">
                            구조동물 상세
                        </h1>
                    </div>

                    {endingSoon && (
                        <div className="alert alert-warning">
                            보호 종료까지{" "}
                            {animal.days_until_end}일 남았습니다.
                        </div>
                    )}

                    <section className="stack">
                        <div className="card card-padded stack">
                            {currentImage ? (
                                <img
                                    src={imageUrl(
                                        currentImage
                                    )}
                                    alt={`${animal.breed || animal.species || "구조동물"} 사진 ${currentImageIndex + 1}`}
                                />
                            ) : (
                                <Empty message="등록된 이미지가 없습니다." />
                            )}

                            {images.length > 0 && (
                                <div className="row-between">
                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={handlePreviousImage}
                                        disabled={images.length < 2}
                                    >
                                        이전
                                    </button>

                                    <span className="text-sub">
                                        {currentImageIndex + 1}
                                        {" / "}
                                        {images.length}
                                    </span>

                                    <button
                                        type="button"
                                        className="btn btn-outline"
                                        onClick={handleNextImage}
                                        disabled={images.length < 2}
                                    >
                                        다음
                                    </button>
                                </div>
                            )}
                        </div>

                        <div className="card card-padded stack">
                            <div className="row-between">
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
                                    {bookmarking
                                        ? "처리 중..."
                                        : animal.is_bookmarked
                                            ? "★ 북마크됨"
                                            : "☆ 북마크"}
                                </button>
                            </div>

                            <h2>
                                {displayValue(
                                    animal.breed
                                )}
                            </h2>

                            <dl className="stack">
                                <div>
                                    <dt>동물 종류</dt>
                                    <dd>
                                        {displayValue(
                                            animal.species
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>품종</dt>
                                    <dd>
                                        {displayValue(
                                            animal.breed
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>색상</dt>
                                    <dd>
                                        {displayColors(
                                            animal.color_tags ||
                                            animal.color
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>성별</dt>
                                    <dd>
                                        {SEX_LABELS[
                                            animal.sex
                                        ] || "정보 없음"}
                                    </dd>
                                </div>

                                <div>
                                    <dt>중성화 여부</dt>
                                    <dd>
                                        {NEUTER_LABELS[
                                            animal.neuter_yn
                                        ] || "정보 없음"}
                                    </dd>
                                </div>

                                <div>
                                    <dt>나이</dt>
                                    <dd>
                                        {displayValue(
                                            animal.age
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>체중</dt>
                                    <dd>
                                        {displayValue(
                                            animal.weight
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>구조 장소</dt>
                                    <dd>
                                        {displayValue(
                                            animal.happen_place
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>구조 날짜</dt>
                                    <dd>
                                        {displayValue(
                                            animal.happen_dt
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>특이사항</dt>
                                    <dd>
                                        {displayValue(
                                            animal.special_mark
                                        )}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div className="card card-padded stack">
                            <h2>
                                보호소 정보
                            </h2>

                            <dl className="stack">
                                <div>
                                    <dt>보호소명</dt>
                                    <dd>
                                        {displayValue(
                                            animal.care_name
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>연락처</dt>
                                    <dd>
                                        {displayValue(
                                            animal.care_tel
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>주소</dt>
                                    <dd>
                                        {displayValue(
                                            animal.care_addr
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>공고 시작일</dt>
                                    <dd>
                                        {displayValue(
                                            animal.notice_start_date
                                        )}
                                    </dd>
                                </div>

                                <div>
                                    <dt>공고 종료일</dt>
                                    <dd>
                                        {displayValue(
                                            animal.notice_end_date
                                        )}
                                    </dd>
                                </div>
                            </dl>

                            {animal.detail_url && (
                                <a
                                    className="btn btn-outline"
                                    href={animal.detail_url}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    원문 공고 보기
                                </a>
                            )}
                        </div>

                        {actionError && (
                            <p
                                className="form-error"
                                role="alert"
                            >
                                {actionError}
                            </p>
                        )}
                    </section>

                    <PostNavigation
                        previousPost={animal.previous_post}
                        nextPost={animal.next_post}
                        getPath={(post) => (
                            `/rescue-animals/${post.source_type}/${post.animal_id}`
                        )}
                        getTitle={(post) => (
                            `${post.breed || post.species || "구조동물"} · ${post.happen_place || "지역 정보 없음"}`
                        )}
                        getDate={(post) => post.happen_dt}
                    />
                </div>
            )}
        </>
    )
}