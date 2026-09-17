import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { createFoundPost } from "../../api/foundPosts.api.js"
import { getBreeds, getColorTags, getRegions } from "../../api/catalog.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"

const EMPTY_FORM = {
    title: "",
    species: "",
    breed: "",
    colors: [],
    sido: "",
    sigungu: "",
    detail_region: "",
    find_date: "",
    description: ""
}

const EMPTY_ERRORS = {
    images: "",
    title: "",
    species: "",
    breed: "",
    colors: "",
    find_date: "",
    sido: "",
    sigungu: "",
    detail_region: ""
}

const MIN_IMAGES = 1
const MAX_IMAGES = 3
const MAX_FILE_SIZE = 10 * 1024 * 1024

const ALLOWED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp"
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

    return new Date(today.getTime() - offset)
        .toISOString()
        .slice(0, 10)
}

export default function FoundCreatePage() {
    const navigate = useNavigate()
    const imagesRef = useRef([])
    const fieldRefs = useRef({})

    const [form, setForm] = useState(EMPTY_FORM)
    const [fieldErrors, setFieldErrors] = useState(EMPTY_ERRORS)

    const [images, setImages] = useState([])
    const [imageDragging, setImageDragging] = useState(false)
    const [breeds, setBreeds] = useState([])
    const [colorTags, setColorTags] = useState([])
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])

    const [breedLoading, setBreedLoading] = useState(false)
    const [breedOptionsOpen, setBreedOptionsOpen] = useState(false)
    const [optionError, setOptionError] = useState("")
    const [submitError, setSubmitError] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const [alertOpen, setAlertOpen] = useState(false)
    const [alertTitle, setAlertTitle] = useState("")
    const [alertMessage, setAlertMessage] = useState("")
    const [alertType, setAlertType] = useState("")
    const [invalidField, setInvalidField] = useState("")
    const [createdPostId, setCreatedPostId] = useState(null)

    useEffect(() => {
        imagesRef.current = images
    }, [images])

    useEffect(() => {
        let cancelled = false

        async function loadInitialOptions() {
            try {
                const [colorResult, regionResult] = await Promise.all([
                    getColorTags(),
                    getRegions()
                ])

                if (cancelled) return

                setColorTags(colorResult?.items ?? [])
                setSidoList(regionResult?.items ?? [])
            } catch (error) {
                if (!cancelled) {
                    setOptionError(
                        error.message ||
                        "선택 정보를 불러오지 못했습니다."
                    )
                }
            }
        }

        loadInitialOptions()

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        if (!form.sido) {
            setSigunguList([])
            return
        }

        let cancelled = false

        getRegions({ parent: form.sido })
            .then((result) => {
                if (!cancelled) {
                    setSigunguList(result?.items ?? [])
                }
            })
            .catch((error) => {
                if (!cancelled) {
                    setOptionError(
                        error.message ||
                        "지역 정보를 불러오지 못했습니다."
                    )
                }
            })

        return () => {
            cancelled = true
        }
    }, [form.sido])

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
                    setOptionError(
                        error.message ||
                        "품종 목록을 불러오지 못했습니다."
                    )
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
            imagesRef.current.forEach((image) => {
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
            const selected = current.colors.includes(color)

            return {
                ...current,
                colors: selected
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

    function handleSidoChange(value) {
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
    }

    function addImages(selectedFiles) {
        if (selectedFiles.length === 0) return

        if (images.length + selectedFiles.length > MAX_IMAGES) {
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

        setImages((current) => [
            ...current,
            ...nextImages
        ])

        setFieldErrors((current) => ({
            ...current,
            images: ""
        }))
    }

    function handleBreedSelect(breed) {
        handleChange("breed", breed)
        setBreedOptionsOpen(false)
    }

    function handleImageChange(event) {
        const selectedFiles = Array.from(event.target.files || [])
        event.target.value = ""
        addImages(selectedFiles)
    }

    function handleImageDrop(event) {
        event.preventDefault()
        setImageDragging(false)

        if (images.length >= MAX_IMAGES) return

        addImages(Array.from(event.dataTransfer.files || []))
    }

    function handleRemoveImage(index) {
        setImages((current) => {
            const target = current[index]

            if (target) {
                URL.revokeObjectURL(target.preview)
            }

            return current.filter(
                (_, imageIndex) => imageIndex !== index
            )
        })
    }

    function showValidationError(field, message) {
        setFieldErrors({
            ...EMPTY_ERRORS,
            [field]: message
        })

        setInvalidField(field)
        scrollToField(field)

        setAlertTitle("입력 확인")
        setAlertMessage(message)
        setAlertType("validation")
        setAlertOpen(true)

        return false
    }

    function validate() {
        if (images.length < MIN_IMAGES) {
            return showValidationError(
                "images",
                "사진을 1장 이상 등록해 주세요."
            )
        }

        if (images.length > MAX_IMAGES) {
            return showValidationError(
                "images",
                `이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`
            )
        }

        if (!form.title.trim()) {
            return showValidationError(
                "title",
                "제목을 입력해 주세요."
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
                "색상을 한 가지 이상 선택해 주세요."
            )
        }

        if (!form.find_date) {
            return showValidationError(
                "find_date",
                "발견 날짜를 선택해 주세요."
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
                "상세 발견 위치를 입력해 주세요."
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

        formData.append("title", form.title.trim())
        formData.append("species", form.species)
        formData.append("breed", form.breed.trim())
        formData.append("color", form.colors.join(","))
        formData.append("region", region)
        formData.append("find_date", form.find_date)

        if (form.description.trim()) {
            formData.append(
                "description",
                form.description.trim()
            )
        }

        images.forEach(({ file }) => {
            formData.append("images", file)
        })

        try {
            const createdPost = await createFoundPost(formData)

            setCreatedPostId(createdPost.id)
            setAlertTitle("등록 완료")
            setAlertMessage(
                "발견제보가 정상적으로 등록되었습니다."
            )
            setAlertType("success")
            setAlertOpen(true)
        } catch (error) {
            setSubmitError(
                error.message ||
                "발견제보 등록에 실패했습니다."
            )
        } finally {
            setSubmitting(false)
        }
    }

    function handleAlertConfirm() {
        setAlertOpen(false)

        if (alertType === "success") {
            navigate(`/found-posts/${createdPostId}`)
            return
        }

        if (
            alertType === "validation" &&
            invalidField
        ) {
            setTimeout(() => {
                focusField(invalidField)
            }, 0)
        }
    }

    const noBreedResult =
        form.species &&
        form.breed.trim() &&
        !breedLoading &&
        breeds.length === 0

    return (
        <div className="container">
            <Breadcrumb
                items={[
                    { label: "홈", to: "/" },
                    {
                        label: "발견제보",
                        to: "/found-posts"
                    },
                    { label: "작성" }
                ]}
            />

            <div className="page-header">
                <h1 className="page-title">
                    발견제보 작성
                </h1>

                <p className="page-desc">
                    발견한 동물의 정보를 가능한 자세히 입력해 주세요.
                </p>
            </div>

            <form
                className="stack"
                onSubmit={handleSubmit}
                noValidate
            >
                <div className="card card-padded stack lost-photo-upload-card">
                    <div className="lost-photo-upload-heading">
                        <h2>사진 추가 <span aria-hidden="true">*</span></h2>
                        <p>최소 1장, 최대 3장 (JPG, PNG, WEBP)</p>
                    </div>

                    <div className="form-field lost-photo-input-field">
                        <input
                            ref={(element) => setFieldRef("images", element)}
                            id="found-images"
                            className="lost-photo-file-input"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleImageChange}
                            disabled={images.length >= MAX_IMAGES}
                        />

                        <div
                            className={`lost-photo-dropzone${images.length > 0 ? " has-images" : ""}${imageDragging ? " is-dragging" : ""}${images.length >= MAX_IMAGES ? " is-disabled" : ""}`}
                            onDragEnter={(event) => {
                                event.preventDefault()
                                if (images.length < MAX_IMAGES) setImageDragging(true)
                            }}
                            onDragOver={(event) => event.preventDefault()}
                            onDragLeave={(event) => {
                                if (!event.currentTarget.contains(event.relatedTarget)) setImageDragging(false)
                            }}
                            onDrop={handleImageDrop}
                        >
                            {images.length === 0 ? (
                                <label className="lost-photo-empty-trigger" htmlFor="found-images">
                                    <span className="lost-photo-dropzone-icon">
                                        <i className="ri-image-add-line" aria-hidden="true" />
                                    </span>
                                    <strong>사진을 드래그하거나 클릭하여 추가하세요</strong>
                                    <span>여러 장을 한 번에 선택할 수 있습니다.</span>
                                </label>
                            ) : (
                                <div className="lost-photo-preview-grid">
                                    {images.length < MAX_IMAGES && (
                                        <label className="lost-photo-add-tile" htmlFor="found-images">
                                            <i className="ri-add-line" aria-hidden="true" />
                                            <span>사진 추가</span>
                                        </label>
                                    )}

                                    {images.map((image, index) => (
                                        <article className="lost-photo-preview-item" key={`${image.file.name}-${image.file.lastModified}-${index}`}>
                                            <div className="lost-photo-preview-frame">
                                                <img src={image.preview} alt={`등록 이미지 ${index + 1}`} />
                                                {index === 0 && <span className="badge lost-photo-primary-badge">대표</span>}
                                                <button
                                                    type="button"
                                                    className="lost-photo-remove-button"
                                                    onClick={() => handleRemoveImage(index)}
                                                    aria-label={`${index + 1}번째 사진 삭제`}
                                                >
                                                    <i className="ri-close-line" aria-hidden="true" />
                                                </button>
                                            </div>
                                        </article>
                                    ))}
                                </div>
                            )}
                        </div>

                        {fieldErrors.images && (
                            <p className="form-error">
                                {fieldErrors.images}
                            </p>
                        )}
                    </div>

                    <p className="text-sub lost-photo-count" aria-live="polite">
                        현재 {images.length}장 / 최소 {MIN_IMAGES}장 / 최대 {MAX_IMAGES}장
                    </p>
                </div>

                <div className="card card-padded stack lost-animal-info-card">
                    <div className="lost-form-section-heading">
                        <h2>발견 정보</h2>
                        <p>발견한 동물의 특징을 정확하게 선택해 주세요.</p>
                    </div>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-title"
                        >
                            제목 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("title", element)}
                            id="found-title"
                            type="text"
                            className={`form-input ${fieldErrors.title ? "is-error" : ""}`}
                            value={form.title}
                            maxLength={100}
                            placeholder="제목을 입력해 주세요"
                            onChange={(event) => handleChange("title", event.target.value)}
                        />

                        {fieldErrors.title && (
                            <p className="form-error">
                                {fieldErrors.title}
                            </p>
                        )}
                    </div>

                    <fieldset ref={(element) => setFieldRef("species", element)} className="lost-choice-field">
                        <legend>동물 종류 *</legend>

                            {["개", "고양이"].map((species) => (
                                <label key={species} className={form.species === species ? "is-selected" : ""}>
                                    <input
                                        type="radio"
                                        name="found-species"
                                        value={species}
                                        checked={form.species === species}
                                        onChange={() => handleSpeciesChange(species)}
                                    />
                                    {species}
                                </label>
                            ))}

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
                        <label
                            className="form-label"
                            htmlFor="found-breed"
                        >
                            품종 *
                        </label>

                        <div className="lost-breed-combobox">
                            <input
                                ref={(element) => setFieldRef("breed", element)}
                                id="found-breed"
                                type="text"
                                role="combobox"
                                aria-autocomplete="list"
                                aria-expanded={breedOptionsOpen}
                                aria-controls="found-breed-options"
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
                                <div id="found-breed-options" className="lost-breed-options" role="listbox">
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

                    <fieldset ref={(element) => setFieldRef("colors", element)} className="lost-choice-field lost-color-field">
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

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-date"
                        >
                            발견 날짜 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("find_date", element)}
                            id="found-date"
                            type="date"
                            className={`form-input ${fieldErrors.find_date ? "is-error" : ""}`}
                            value={form.find_date}
                            max={getToday()}
                            onClick={(event) => event.currentTarget.showPicker?.()}
                            onChange={(event) => handleChange("find_date", event.target.value)}
                        />

                        {fieldErrors.find_date && (
                            <p className="form-error">
                                {fieldErrors.find_date}
                            </p>
                        )}
                    </div>
                </div>

                <div className="card card-padded stack">
                    <h2>발견 위치</h2>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-sido"
                        >
                            시/도 *
                        </label>

                        <select
                            ref={(element) => setFieldRef("sido", element)}
                            id="found-sido"
                            className={`form-select ${fieldErrors.sido ? "is-error" : ""}`}
                            value={form.sido}
                            onChange={(event) => handleSidoChange(event.target.value)}
                        >
                            <option value="">
                                시/도 선택
                            </option>

                            {sidoList.map((sido) => (
                                <option
                                    key={sido}
                                    value={sido}
                                >
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
                        <label
                            className="form-label"
                            htmlFor="found-sigungu"
                        >
                            시/군/구 *
                        </label>

                        <select
                            ref={(element) => setFieldRef("sigungu", element)}
                            id="found-sigungu"
                            className={`form-select ${fieldErrors.sigungu ? "is-error" : ""}`}
                            value={form.sigungu}
                            disabled={!form.sido}
                            onChange={(event) => handleChange("sigungu", event.target.value)}
                        >
                            <option value="">
                                시/군/구 선택
                            </option>

                            {sigunguList.map((sigungu) => (
                                <option
                                    key={sigungu}
                                    value={sigungu}
                                >
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
                        <label
                            className="form-label"
                            htmlFor="found-detail-region"
                        >
                            상세 위치 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("detail_region", element)}
                            id="found-detail-region"
                            type="text"
                            className={`form-input ${fieldErrors.detail_region ? "is-error" : ""}`}
                            value={form.detail_region}
                            placeholder="예: 성신여대입구역 1번 출구 앞"
                            onChange={(event) => handleChange("detail_region", event.target.value)}
                        />

                        {fieldErrors.detail_region && (
                            <p className="form-error">
                                {fieldErrors.detail_region}
                            </p>
                        )}
                    </div>
                </div>

                <div className="card card-padded stack">
                    <h2>상세 내용</h2>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-description"
                        >
                            상세 내용
                        </label>

                        <textarea
                            id="found-description"
                            className="form-textarea"
                            value={form.description}
                            placeholder="발견 당시 상황이나 동물의 특징을 입력해 주세요."
                            onChange={(event) => handleChange("description", event.target.value)}
                        />
                    </div>
                </div>

                {optionError && (
                    <p
                        className="form-error"
                        role="alert"
                    >
                        {optionError}
                    </p>
                )}

                {submitError && (
                    <p
                        className="form-error"
                        role="alert"
                    >
                        {submitError}
                    </p>
                )}

                <div className="row-between">
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={() => navigate("/found-posts")}
                        disabled={submitting}
                    >
                        취소
                    </button>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={submitting}
                    >
                        {submitting
                            ? "등록 중..."
                            : "발견제보 등록"}
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
