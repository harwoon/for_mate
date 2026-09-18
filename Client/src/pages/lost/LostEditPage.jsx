import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { getLostPost, updateLostPost } from "../../api/lostPosts.api.js"
import { getBreeds, getColorTags, getRegions } from "../../api/catalog.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"

const EMPTY_FORM = {
    pet_name: "",
    species: "",
    breed: "",
    colors: [],
    sex: "",
    neuter_yn: "",
    sido: "",
    sigungu: "",
    detail_region: "",
    event_date: "",
    description: ""
}

const EMPTY_ERRORS = {
    images: "",
    pet_name: "",
    species: "",
    breed: "",
    colors: "",
    sex: "",
    neuter_yn: "",
    sido: "",
    sigungu: "",
    detail_region: "",
    event_date: ""
}

const MAX_IMAGES = 8
const MIN_IMAGES = 1
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]
const PHOTO_GUIDE_EXAMPLES = [
    { key: "good", label: "좋은 예시", src: "/images/lost/good-photo-example.webp", good: true },
    { key: "dark", label: "어두운 사진", src: "/images/lost/bad-photo-dark.webp" },
    { key: "side", label: "측면 사진", src: "/images/lost/bad-photo-side.webp" },
    { key: "blur", label: "흔들린 사진", src: "/images/lost/bad-photo-blur.webp" },
    { key: "person", label: "사람과 함께", src: "/images/lost/bad-photo-person.webp" }
]
const COLOR_PREVIEW_CLASSES = {
    흰색: "is-white",
    검은색: "is-black",
    갈색: "is-brown",
    황색: "is-yellow",
    회색: "is-gray",
    크림색: "is-cream",
    기타: "is-other"
}

function getToday() {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60 * 1000

    return new Date(today.getTime() - offset).toISOString().slice(0, 10)
}

function normalizeColors(value) {
    if (!value) return []

    if (Array.isArray(value)) {
        return value
            .map((color) => String(color).trim())
            .filter(Boolean)
    }

    return String(value)
        .split(",")
        .map((color) => color.trim())
        .filter(Boolean)
}

export default function LostEditPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    const newImagesRef = useRef([])
    const fieldRefs = useRef({})

    const [form, setForm] = useState(EMPTY_FORM)
    const [fieldErrors, setFieldErrors] = useState(EMPTY_ERRORS)

    const [existingImages, setExistingImages] = useState([])
    const [newImages, setNewImages] = useState([])
    const [deleteImageIds, setDeleteImageIds] = useState([])
    const [imageDragging, setImageDragging] = useState(false)

    const [breeds, setBreeds] = useState([])
    const [colorTags, setColorTags] = useState([])
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])

    const [breedLoading, setBreedLoading] = useState(false)
    const [breedOptionsOpen, setBreedOptionsOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [optionError, setOptionError] = useState("")
    const [submitError, setSubmitError] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [retryCount, setRetryCount] = useState(0)

    const [alertOpen, setAlertOpen] = useState(false)
    const [alertTitle, setAlertTitle] = useState("")
    const [alertMessage, setAlertMessage] = useState("")
    const [alertType, setAlertType] = useState("")
    const [invalidField, setInvalidField] = useState("")

    useEffect(() => {
        newImagesRef.current = newImages
    }, [newImages])

    useEffect(() => {
        let cancelled = false

        async function loadPage() {
            setLoading(true)
            setError("")
            setOptionError("")

            try {
                const [postResult, colorResult, regionResult] = await Promise.all([
                    getLostPost(id),
                    getColorTags(),
                    getRegions()
                ])

                if (cancelled) return

                if (!postResult?.is_owner) {
                    setError("찾고있어요 글을 수정할 권한이 없습니다.")
                    return
                }

                const colorItems = colorResult?.items ?? []
                const sidoItems = regionResult?.items ?? []
                const rawRegion = String(postResult.region || "").trim()

                const initialSido = sidoItems.find((sido) => (
                    rawRegion === sido || rawRegion.startsWith(`${sido} `)
                )) || ""

                let sigunguItems = []
                let initialSigungu = ""
                let detailRegion = rawRegion

                if (initialSido) {
                    const sigunguResult = await getRegions({
                        parent: initialSido
                    })

                    if (cancelled) return

                    sigunguItems = sigunguResult?.items ?? []

                    const regionAfterSido = rawRegion
                        .slice(initialSido.length)
                        .trim()

                    initialSigungu = sigunguItems.find((sigungu) => (
                        regionAfterSido === sigungu ||
                        regionAfterSido.startsWith(`${sigungu} `)
                    )) || ""

                    detailRegion = initialSigungu
                        ? regionAfterSido.slice(initialSigungu.length).trim()
                        : regionAfterSido
                }

                setColorTags(colorItems)
                setSidoList(sidoItems)
                setSigunguList(sigunguItems)
                setExistingImages(postResult.images ?? [])

                setForm({
                    pet_name: postResult.pet_name ?? "",
                    species: postResult.species ?? "",
                    breed: postResult.breed ?? "",
                    colors: normalizeColors(postResult.color),
                    sex: postResult.sex ?? "",
                    neuter_yn: postResult.neuter_yn ?? "",
                    sido: initialSido,
                    sigungu: initialSigungu,
                    detail_region: detailRegion,
                    event_date: postResult.event_date
                        ? String(postResult.event_date).slice(0, 10)
                        : "",
                    description: postResult.description ?? ""
                })
            } catch (error) {
                if (!cancelled) {
                    setError(error.message || "찾고있어요 글 정보를 불러오지 못했습니다.")
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadPage()

        return () => {
            cancelled = true
        }
    }, [id, retryCount])

    useEffect(() => {
        if (!form.species) {
            setBreeds([])
            return
        }

        let cancelled = false

        const timer = setTimeout(async () => {
            setBreedLoading(true)

            try {
                const result = await getBreeds({
                    species: form.species,
                    keyword: form.breed.trim()
                })

                if (!cancelled) {
                    setBreeds(result?.items ?? [])
                }
            } catch (error) {
                if (!cancelled) {
                    setOptionError(error.message || "품종 목록을 불러오지 못했습니다.")
                }
            } finally {
                if (!cancelled) {
                    setBreedLoading(false)
                }
            }
        }, 250)

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [form.species, form.breed])

    useEffect(() => {
        return () => {
            newImagesRef.current.forEach((image) => {
                URL.revokeObjectURL(image.preview)
            })
        }
    }, [])

    function setFieldRef(field, element) {
        if (element) {
            fieldRefs.current[field] = element
        }
    }

    function scrollToField(field) {
        const element = fieldRefs.current[field]

        if (!element) return

        element.scrollIntoView({
            behavior: "smooth",
            block: "center"
        })
    }

    function focusField(field) {
        const element = fieldRefs.current[field]

        if (!element) return

        if (element.matches?.("input, select, textarea, button")) {
            element.focus()
            return
        }

        const focusTarget = element.querySelector?.(
            "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])"
        )

        focusTarget?.focus()
    }

    function handleChange(field, value) {
        setForm((current) => ({
            ...current,
            [field]: value
        }))

        if (fieldErrors[field]) {
            setFieldErrors((current) => ({
                ...current,
                [field]: ""
            }))
        }
    }

    function handleSpeciesChange(value) {
        setForm((current) => ({
            ...current,
            species: value,
            breed: ""
        }))

        setBreeds([])
        setBreedOptionsOpen(false)

        setFieldErrors((current) => ({
            ...current,
            species: "",
            breed: ""
        }))
    }

    function handleColorToggle(color) {
        setForm((current) => {
            const isSelected = current.colors.includes(color)

            return {
                ...current,
                colors: isSelected
                    ? current.colors.filter((item) => item !== color)
                    : [...current.colors, color]
            }
        })

        if (fieldErrors.colors) {
            setFieldErrors((current) => ({
                ...current,
                colors: ""
            }))
        }
    }

    async function handleSidoChange(value) {
        setForm((current) => ({
            ...current,
            sido: value,
            sigungu: ""
        }))

        setSigunguList([])

        setFieldErrors((current) => ({
            ...current,
            sido: "",
            sigungu: ""
        }))

        if (!value) return

        try {
            const result = await getRegions({ parent: value })
            setSigunguList(result?.items ?? [])
        } catch (error) {
            setOptionError(error.message || "지역 정보를 불러오지 못했습니다.")
        }
    }

    function addNewImages(selectedFiles) {
        if (selectedFiles.length === 0) return

        const currentImageCount = existingImages.length + newImages.length

        if (currentImageCount + selectedFiles.length > MAX_IMAGES) {
            setFieldErrors((current) => ({
                ...current,
                images: `이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`
            }))
            return
        }

        const invalidType = selectedFiles.find(
            (file) => !ALLOWED_IMAGE_TYPES.includes(file.type)
        )

        if (invalidType) {
            setFieldErrors((current) => ({
                ...current,
                images: "JPG, PNG, WEBP 이미지만 등록할 수 있습니다."
            }))
            return
        }

        const oversizedFile = selectedFiles.find(
            (file) => file.size > MAX_FILE_SIZE
        )

        if (oversizedFile) {
            setFieldErrors((current) => ({
                ...current,
                images: "이미지는 한 장당 10MB 이하여야 합니다."
            }))
            return
        }

        const nextImages = selectedFiles.map((file) => ({
            file,
            preview: URL.createObjectURL(file)
        }))

        setNewImages((current) => [...current, ...nextImages])

        setFieldErrors((current) => ({
            ...current,
            images: ""
        }))
    }

    function handleBreedSelect(breed) {
        handleChange("breed", breed)
        setBreedOptionsOpen(false)
    }

    function handleNewImageChange(event) {
        const selectedFiles = Array.from(event.target.files || [])
        event.target.value = ""
        addNewImages(selectedFiles)
    }

    function handleNewImageDrop(event) {
        event.preventDefault()
        setImageDragging(false)

        if (existingImages.length + newImages.length >= MAX_IMAGES) return

        addNewImages(Array.from(event.dataTransfer.files || []))
    }

    function handleRemoveExistingImage(imageId) {
        setExistingImages((current) => (
            current.filter((image) => String(image.id) !== String(imageId))
        ))

        setDeleteImageIds((current) => (
            current.includes(String(imageId))
                ? current
                : [...current, String(imageId)]
        ))

        setFieldErrors((current) => ({
            ...current,
            images: ""
        }))
    }

    function handleRemoveNewImage(index) {
        setNewImages((current) => {
            const target = current[index]

            if (target) {
                URL.revokeObjectURL(target.preview)
            }

            return current.filter((_, imageIndex) => imageIndex !== index)
        })
    }

    function showValidationAlert(message) {
        setAlertTitle("입력 확인")
        setAlertMessage(message)
        setAlertType("validation")
        setAlertOpen(true)
    }

    function showValidationError(field, message) {
        setFieldErrors({
            ...EMPTY_ERRORS,
            [field]: message
        })

        setInvalidField(field)
        scrollToField(field)
        showValidationAlert(message)

        return false
    }

    function validate() {
        const imageCount = existingImages.length + newImages.length

        if (imageCount < MIN_IMAGES) {
            return showValidationError(
                "images",
                `이미지를 ${MIN_IMAGES}장 이상 유지하거나 등록해 주세요.`
            )
        }

        if (imageCount > MAX_IMAGES) {
            return showValidationError(
                "images",
                `이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`
            )
        }

        if (!form.pet_name.trim()) {
            return showValidationError(
                "pet_name",
                "반려동물 이름을 입력해 주세요."
            )
        }

        if (!form.species) {
            return showValidationError(
                "species",
                "동물 종류를 선택해 주세요."
            )
        }

        if (!form.breed.trim()) {
            return showValidationError(
                "breed",
                "품종을 입력해 주세요."
            )
        }

        if (form.colors.length === 0) {
            return showValidationError(
                "colors",
                "털 색상을 한 가지 이상 선택해 주세요."
            )
        }

        if (!form.sex) {
            return showValidationError(
                "sex",
                "성별을 선택해 주세요."
            )
        }

        if (!form.neuter_yn) {
            return showValidationError(
                "neuter_yn",
                "중성화 여부를 선택해 주세요."
            )
        }

        if (!form.sido) {
            return showValidationError(
                "sido",
                "시/도를 선택해 주세요."
            )
        }

        if (!form.sigungu) {
            return showValidationError(
                "sigungu",
                "시/군/구를 선택해 주세요."
            )
        }

        if (!form.detail_region.trim()) {
            return showValidationError(
                "detail_region",
                "상세 위치를 입력해 주세요."
            )
        }

        if (!form.event_date) {
            return showValidationError(
                "event_date",
                "실종 날짜를 선택해 주세요."
            )
        }

        setFieldErrors(EMPTY_ERRORS)
        setInvalidField("")

        return true
    }

    async function handleSubmit(event) {
        event.preventDefault()

        if (!validate()) return

        setSubmitting(true)
        setSubmitError("")

        const region = [
            form.sido,
            form.sigungu,
            form.detail_region.trim()
        ]
            .filter(Boolean)
            .join(" ")

        const formData = new FormData()

        formData.append("pet_name", form.pet_name.trim())
        formData.append("species", form.species)
        formData.append("breed", form.breed.trim())
        formData.append("sex", form.sex)
        formData.append("neuter_yn", form.neuter_yn)
        formData.append("region", region)
        formData.append("event_date", form.event_date)
        formData.append("description", form.description.trim())
        formData.append("delete_image_ids", JSON.stringify(deleteImageIds))

        form.colors.forEach((color) => {
            formData.append("color", color)
        })

        newImages.forEach(({ file }) => {
            formData.append("images", file)
        })

        try {
            await updateLostPost(id, formData)

            setAlertTitle("수정 완료")
            setAlertMessage("찾고있어요 글이 수정되었습니다.")
            setAlertType("success")
            setAlertOpen(true)
        } catch (error) {
            setSubmitError(error.message || "찾고있어요 글 수정에 실패했습니다.")
        } finally {
            setSubmitting(false)
        }
    }

    function handleAlertConfirm() {
        setAlertOpen(false)

        if (alertType === "success") {
            navigate(`/lost-posts/${id}`, {
                replace: true
            })

            return
        }

        if (alertType === "validation" && invalidField) {
            setTimeout(() => {
                focusField(invalidField)
            }, 0)
        }
    }

    const imageCount = existingImages.length + newImages.length

    const noBreedResult =
        form.species &&
        form.breed.trim() &&
        !breedLoading &&
        breeds.length === 0

    if (loading) {
        return <Loading message="찾고있어요 글 정보를 불러오는 중입니다." />
    }

    if (error) {
        return (
            <ErrorState
                message={error}
                onRetry={() => setRetryCount((count) => count + 1)}
            />
        )
    }

    return (
        <div className="container">
            <Breadcrumb
                items={[
                    { label: "홈", to: "/" },
                    { label: "찾고있어요", to: "/lost-posts" },
                    { label: "상세", to: `/lost-posts/${id}` },
                    { label: "수정" }
                ]}
            />

            <div className="page-header">
                <h1 className="page-title">찾고있어요 글 수정</h1>

                <p className="page-desc">
                    등록한 실종동물 정보를 수정해 주세요.
                </p>
            </div>

            <form className="stack" onSubmit={handleSubmit} noValidate>
                <div className="card card-padded stack lost-photo-upload-card">
                    <div className="lost-photo-upload-heading">
                        <h2>사진 수정 <span aria-hidden="true">*</span></h2>
                        <p>최소 1장, 권장 5장, 최대 8장 (JPG, PNG, WEBP)</p>
                    </div>

                    <div className="form-field lost-photo-input-field" ref={(element) => setFieldRef("images", element)}>
                        <input
                            id="lost-edit-images"
                            className="lost-photo-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleNewImageChange}
                            disabled={imageCount >= MAX_IMAGES}
                        />

                        <div
                            className={`lost-photo-dropzone${imageCount > 0 ? " has-images" : ""}${imageDragging ? " is-dragging" : ""}${imageCount >= MAX_IMAGES ? " is-disabled" : ""}`}
                            onDragEnter={(event) => {
                                event.preventDefault()
                                if (imageCount < MAX_IMAGES) setImageDragging(true)
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDragLeave={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) setImageDragging(false)
                            }}
                            onDrop={handleNewImageDrop}
                        >
                            {imageCount === 0 ? (
                                <label className="lost-photo-empty-trigger" htmlFor="lost-edit-images">
                                    <span className="lost-photo-dropzone-icon">
                                        <i className="ri-image-add-line" aria-hidden="true" />
                                    </span>
                                    <strong>사진을 드래그하거나 클릭하여 추가하세요</strong>
                                    <span>여러 장을 한 번에 선택할 수 있습니다.</span>
                                </label>
                            ) : (
                                <div className="lost-photo-preview-grid">
                                    {imageCount < MAX_IMAGES && (
                                        <label className="lost-photo-add-tile" htmlFor="lost-edit-images">
                                            <i className="ri-add-line" aria-hidden="true" />
                                            <span>사진 추가</span>
                                        </label>
                                    )}

                                    {existingImages.map((image, index) => (
                                        <article className="lost-photo-preview-item" key={image.id}>
                                            <div className="lost-photo-preview-frame">
                                                <img src={image.image_url} alt={`기존 이미지 ${index + 1}`} />
                                                {index === 0 && <span className="badge lost-photo-primary-badge">대표</span>}
                                                <button
                                                    type="button"
                                                    className="lost-photo-remove-button"
                                                    onClick={() => handleRemoveExistingImage(image.id)}
                                                    aria-label={`${index + 1}번째 기존 사진 삭제`}
                                                >
                                                    <i className="ri-close-line" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </article>
                                    ))}

                                    {newImages.map((image, index) => (
                                        <article className="lost-photo-preview-item" key={`${image.file.name}-${image.file.lastModified}-${index}`}>
                                            <div className="lost-photo-preview-frame">
                                                <img src={image.preview} alt={`새 이미지 ${index + 1}`} />
                                                {existingImages.length === 0 && index === 0 && (
                                                    <span className="badge lost-photo-primary-badge">대표</span>
                                                )}
                                                <button
                                                    type="button"
                                                    className="lost-photo-remove-button"
                                                    onClick={() => handleRemoveNewImage(index)}
                                                    aria-label={`${index + 1}번째 새 사진 삭제`}
                                                >
                                                    <i className="ri-close-line" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        {fieldErrors.images && <p className="form-error">{fieldErrors.images}</p>}
                    </div>

                    <p className="lost-photo-ai-warning" role="note">
                        <i className="ri-error-warning-line" aria-hidden="true" />
                        <span>유사한 사진이나 같은 사진을 올릴 경우 AI 매칭이 어려울 수 있습니다!</span>
                    </p>

                    <aside className="lost-photo-guide" aria-label="반려동물 사진 촬영 안내">
                        <div className="lost-photo-guide-copy">
                            <i className="ri-lightbulb-flash-line" aria-hidden="true" />
                            <div>
                                <h3>이런 사진이 좋아요!</h3>
                                <p>정면에 몸 전체가 보이는<br />선명한 사진을 올려주세요.</p>
                            </div>
                        </div>

                        <div className="lost-photo-guide-examples">
                            {PHOTO_GUIDE_EXAMPLES.map((example) => (
                                <figure key={example.key} className={`lost-photo-guide-example${example.good ? " is-good" : " is-bad"}`}>
                                    <div className="lost-photo-guide-image-wrap">
                                        <i className="ri-image-line" aria-hidden="true" />
                                        <img
                                            className="lost-photo-guide-image"
                                            src={example.src}
                                            alt={`${example.label} 안내 이미지`}
                                            onError={(event) => { event.currentTarget.hidden = true }}
                                        />
                                        <span className="lost-photo-guide-mark" aria-hidden="true">
                                            <i className={example.good ? "ri-check-line" : "ri-close-line"} />
                                        </span>
                                    </div>
                                    <figcaption>{example.label}</figcaption>
                                </figure>
                            ))}
                        </div>
                    </aside>

                    <p className="text-sub lost-photo-count" aria-live="polite">
                        현재 {imageCount}장 / 최소 {MIN_IMAGES}장 / 최대 {MAX_IMAGES}장
                    </p>
                </div>

                <div className="card card-padded stack lost-animal-info-card">
                    <div className="lost-form-section-heading">
                        <h2>동물 정보</h2>
                        <p>반려동물의 특징을 정확하게 선택해 주세요.</p>
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="edit-pet-name">
                            이름 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("pet_name", element)}
                            id="edit-pet-name"
                            type="text"
                            className={`form-input${fieldErrors.pet_name ? " is-error" : ""}`}
                            value={form.pet_name}
                            maxLength={50}
                            onChange={(event) => handleChange("pet_name", event.target.value)}
                        />

                        {fieldErrors.pet_name && (
                            <p className="form-error">
                                {fieldErrors.pet_name}
                            </p>
                        )}
                    </div>

                    <fieldset className="lost-choice-field" ref={(element) => setFieldRef("species", element)}>
                        <legend>종류 *</legend>

                        <label className={form.species === "개" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-species"
                                checked={form.species === "개"}
                                onChange={() => handleSpeciesChange("개")}
                            />
                            개
                        </label>

                        <label className={form.species === "고양이" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-species"
                                checked={form.species === "고양이"}
                                onChange={() => handleSpeciesChange("고양이")}
                            />
                            고양이
                        </label>

                        {fieldErrors.species && (
                            <p className="form-error">
                                {fieldErrors.species}
                            </p>
                        )}
                    </fieldset>

                    <div
                        className="form-field lost-breed-field"
                        onBlur={(event) => {
                            if (!event.currentTarget.contains(event.relatedTarget)) setBreedOptionsOpen(false)
                        }}
                    >
                        <label className="form-label" htmlFor="edit-breed">
                            품종 *
                        </label>

                        <div className="lost-breed-combobox">
                            <input
                                ref={(element) => setFieldRef("breed", element)}
                                id="edit-breed"
                                type="text"
                                role="combobox"
                                aria-autocomplete="list"
                                aria-expanded={breedOptionsOpen}
                                aria-controls="lost-edit-breed-options"
                                autoComplete="off"
                                className={`form-input${fieldErrors.breed ? " is-error" : ""}`}
                                value={form.breed}
                                disabled={!form.species}
                                placeholder={form.species ? "품종을 입력하거나 선택해 주세요" : "동물 종류를 먼저 선택해 주세요"}
                                onFocus={() => setBreedOptionsOpen(true)}
                                onChange={(event) => {
                                    handleChange("breed", event.target.value)
                                    setBreedOptionsOpen(true)
                                }}
                            />

                            <button
                                type="button"
                                className="lost-breed-toggle"
                                disabled={!form.species}
                                onClick={() => setBreedOptionsOpen((open) => !open)}
                                aria-label="품종 목록 열기"
                                tabIndex={-1}
                            >
                                <i className={breedOptionsOpen ? "ri-arrow-up-s-line" : "ri-arrow-down-s-line"} aria-hidden="true" />
                            </button>

                            {breedOptionsOpen && form.species && (
                                <div id="lost-edit-breed-options" className="lost-breed-options" role="listbox">
                                    {breedLoading ? (
                                        <p className="lost-breed-state">품종을 검색하는 중입니다.</p>
                                    ) : noBreedResult ? (
                                        <p className="lost-breed-state">검색 결과가 없습니다.</p>
                                    ) : (
                                        breeds.map((breed) => (
                                            <button
                                                key={breed.id ?? breed.name}
                                                type="button"
                                                role="option"
                                                aria-selected={form.breed === breed.name}
                                                className={form.breed === breed.name ? "is-selected" : ""}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => handleBreedSelect(breed.name)}
                                            >
                                                <span>{breed.name}</span>
                                                {form.breed === breed.name && <i className="ri-check-line" aria-hidden="true" />}
                                            </button>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>

                        {fieldErrors.breed && (
                            <p className="form-error">
                                {fieldErrors.breed}
                            </p>
                        )}
                    </div>

                    <fieldset className="lost-choice-field lost-color-field" ref={(element) => setFieldRef("colors", element)}>
                        <legend>털 색상 *</legend>

                        {colorTags.map((color) => (
                            <label key={color} className={form.colors.includes(color) ? "is-selected" : ""}>
                                <input
                                    type="checkbox"
                                    checked={form.colors.includes(color)}
                                    onChange={() => handleColorToggle(color)}
                                />
                                <span className={`lost-color-preview ${COLOR_PREVIEW_CLASSES[color] || "is-other"}`} aria-hidden="true" />
                                {color}
                            </label>
                        ))}

                        {fieldErrors.colors && (
                            <p className="form-error">
                                {fieldErrors.colors}
                            </p>
                        )}
                    </fieldset>

                    <fieldset className="lost-choice-field" ref={(element) => setFieldRef("sex", element)}>
                        <legend>성별 *</legend>

                        <label className={form.sex === "M" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-sex"
                                checked={form.sex === "M"}
                                onChange={() => handleChange("sex", "M")}
                            />
                            수컷
                        </label>

                        <label className={form.sex === "F" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-sex"
                                checked={form.sex === "F"}
                                onChange={() => handleChange("sex", "F")}
                            />
                            암컷
                        </label>

                        <label className={form.sex === "Q" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-sex"
                                checked={form.sex === "Q"}
                                onChange={() => handleChange("sex", "Q")}
                            />
                            미상
                        </label>

                        {fieldErrors.sex && (
                            <p className="form-error">
                                {fieldErrors.sex}
                            </p>
                        )}
                    </fieldset>

                    <fieldset className="lost-choice-field" ref={(element) => setFieldRef("neuter_yn", element)}>
                        <legend>중성화 여부 *</legend>

                        <label className={form.neuter_yn === "Y" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-neuter"
                                checked={form.neuter_yn === "Y"}
                                onChange={() => handleChange("neuter_yn", "Y")}
                            />
                            중성화 완료
                        </label>

                        <label className={form.neuter_yn === "N" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-neuter"
                                checked={form.neuter_yn === "N"}
                                onChange={() => handleChange("neuter_yn", "N")}
                            />
                            중성화 안 됨
                        </label>

                        <label className={form.neuter_yn === "U" ? "is-selected" : ""}>
                            <input
                                type="radio"
                                name="edit-neuter"
                                checked={form.neuter_yn === "U"}
                                onChange={() => handleChange("neuter_yn", "U")}
                            />
                            미상
                        </label>

                        {fieldErrors.neuter_yn && (
                            <p className="form-error">
                                {fieldErrors.neuter_yn}
                            </p>
                        )}
                    </fieldset>
                </div>

                <div className="card card-padded stack">
                    <h2>실종 정보</h2>

                    <fieldset>
                        <legend>실종 위치 *</legend>

                        <div className="form-field">
                            <label className="form-label" htmlFor="edit-sido">
                                시/도 *
                            </label>

                            <select
                                ref={(element) => setFieldRef("sido", element)}
                                id="edit-sido"
                                className={`form-select${fieldErrors.sido ? " is-error" : ""}`}
                                value={form.sido}
                                onChange={(event) => handleSidoChange(event.target.value)}
                            >
                                <option value="">시/도 선택</option>

                                {sidoList.map((sido) => (
                                    <option key={sido} value={sido}>
                                        {sido}
                                    </option>
                                ))}
                            </select>

                            {fieldErrors.sido && (
                                <p className="form-error">
                                    {fieldErrors.sido}
                                </p>
                            )}
                        </div>

                        <div className="form-field">
                            <label className="form-label" htmlFor="edit-sigungu">
                                시/군/구 *
                            </label>

                            <select
                                ref={(element) => setFieldRef("sigungu", element)}
                                id="edit-sigungu"
                                className={`form-select${fieldErrors.sigungu ? " is-error" : ""}`}
                                value={form.sigungu}
                                disabled={!form.sido}
                                onChange={(event) => handleChange("sigungu", event.target.value)}
                            >
                                <option value="">시/군/구 선택</option>

                                {sigunguList.map((sigungu) => (
                                    <option key={sigungu} value={sigungu}>
                                        {sigungu}
                                    </option>
                                ))}
                            </select>

                            {fieldErrors.sigungu && (
                                <p className="form-error">
                                    {fieldErrors.sigungu}
                                </p>
                            )}
                        </div>

                        <div className="form-field">
                            <label className="form-label" htmlFor="edit-detail-region">
                                상세 위치 *
                            </label>

                            <input
                                ref={(element) => setFieldRef("detail_region", element)}
                                id="edit-detail-region"
                                type="text"
                                className={`form-input${fieldErrors.detail_region ? " is-error" : ""}`}
                                value={form.detail_region}
                                onChange={(event) => handleChange("detail_region", event.target.value)}
                            />

                            {fieldErrors.detail_region && (
                                <p className="form-error">
                                    {fieldErrors.detail_region}
                                </p>
                            )}
                        </div>
                    </fieldset>

                    <div className="form-field">
                        <label className="form-label" htmlFor="edit-event-date">
                            실종 날짜 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("event_date", element)}
                            id="edit-event-date"
                            type="date"
                            className={`form-input${fieldErrors.event_date ? " is-error" : ""}`}
                            value={form.event_date}
                            max={getToday()}
                            onClick={(event) => event.currentTarget.showPicker?.()}
                            onChange={(event) => handleChange("event_date", event.target.value)}
                        />

                        {fieldErrors.event_date && (
                            <p className="form-error">
                                {fieldErrors.event_date}
                            </p>
                        )}
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="edit-description">
                            특징
                        </label>

                        <textarea
                            id="edit-description"
                            className="form-textarea"
                            value={form.description}
                            onChange={(event) => handleChange("description", event.target.value)}
                        />
                    </div>
                </div>

                {optionError && (
                    <p role="alert" className="form-error">
                        {optionError}
                    </p>
                )}

                {submitError && (
                    <p role="alert" className="form-error">
                        {submitError}
                    </p>
                )}

                <div className="row">
                    <button
                        type="button"
                        className="btn btn-outline"
                        disabled={submitting}
                        onClick={() => navigate(`/lost-posts/${id}`)}
                    >
                        취소
                    </button>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                    >
                        {submitting ? "수정 중..." : "수정 완료"}
                    </button>
                </div>
            </form>

            <AlertModal
                open={alertOpen}
                title={alertTitle}
                message={alertMessage}
                onConfirm={handleAlertConfirm}
            />
        </div>
    )
}
