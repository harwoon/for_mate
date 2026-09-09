import { useEffect, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { imageUrl } from "../../api/client.js"
import {
    getFoundPost,
    updateFoundPost
} from "../../api/foundPosts.api.js"
import {
    getBreeds,
    getColorTags,
    getRegions
} from "../../api/catalog.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"
import Breadcrumb from "../../components/common/Breadcrumb.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"

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

function getToday() {
    const today = new Date()
    const offset = today.getTimezoneOffset() * 60 * 1000

    return new Date(today.getTime() - offset)
        .toISOString()
        .slice(0, 10)
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

export default function FoundEditPage() {
    const { id } = useParams()
    const navigate = useNavigate()

    const newImagesRef = useRef([])
    const fieldRefs = useRef({})

    const [form, setForm] = useState(EMPTY_FORM)
    const [fieldErrors, setFieldErrors] = useState(EMPTY_ERRORS)

    const [existingImages, setExistingImages] = useState([])
    const [deletedImageUrls, setDeletedImageUrls] = useState([])
    const [newImages, setNewImages] = useState([])

    const [breeds, setBreeds] = useState([])
    const [colorTags, setColorTags] = useState([])
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])

    const [breedLoading, setBreedLoading] = useState(false)
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
                const [
                    postResult,
                    colorResult,
                    regionResult
                ] = await Promise.all([
                    getFoundPost(id),
                    getColorTags(),
                    getRegions()
                ])

                if (cancelled) return

                if (!postResult?.is_owner) {
                    setError(
                        "발견제보를 수정할 권한이 없습니다."
                    )
                    return
                }

                const colorItems = colorResult?.items ?? []
                const sidoItems = regionResult?.items ?? []
                const rawRegion = String(
                    postResult.region || ""
                ).trim()

                const initialSido = sidoItems.find(
                    (sido) => (
                        rawRegion === sido ||
                        rawRegion.startsWith(`${sido} `)
                    )
                ) || ""

                let sigunguItems = []
                let initialSigungu = ""
                let detailRegion = rawRegion

                if (initialSido) {
                    const sigunguResult = await getRegions({
                        parent: initialSido
                    })

                    if (cancelled) return

                    sigunguItems =
                        sigunguResult?.items ?? []

                    const regionAfterSido = rawRegion
                        .slice(initialSido.length)
                        .trim()

                    initialSigungu = sigunguItems.find(
                        (sigungu) => (
                            regionAfterSido === sigungu ||
                            regionAfterSido.startsWith(
                                `${sigungu} `
                            )
                        )
                    ) || ""

                    detailRegion = initialSigungu
                        ? regionAfterSido
                            .slice(initialSigungu.length)
                            .trim()
                        : regionAfterSido
                }

                setColorTags(colorItems)
                setSidoList(sidoItems)
                setSigunguList(sigunguItems)
                setExistingImages(postResult.images ?? [])

                setForm({
                    title: postResult.title ?? "",
                    species: postResult.species ?? "",
                    breed: postResult.breed ?? "",
                    colors: normalizeColors(
                        postResult.color
                    ),
                    sido: initialSido,
                    sigungu: initialSigungu,
                    detail_region: detailRegion,
                    find_date: postResult.find_date
                        ? String(postResult.find_date)
                            .slice(0, 10)
                        : "",
                    description:
                        postResult.description ?? ""
                })
            } catch (error) {
                if (!cancelled) {
                    setError(
                        error.message ||
                        "발견제보 정보를 불러오지 못했습니다."
                    )
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

        if (
            element.matches?.(
                "input, select, textarea, button"
            )
        ) {
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

        setFieldErrors((current) => ({
            ...current,
            species: "",
            breed: ""
        }))
    }

    function handleColorToggle(color) {
        setForm((current) => {
            const selected =
                current.colors.includes(color)

            return {
                ...current,
                colors: selected
                    ? current.colors.filter(
                        (item) => item !== color
                    )
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
            const result = await getRegions({
                parent: value
            })

            setSigunguList(result?.items ?? [])
        } catch (error) {
            setOptionError(
                error.message ||
                "지역 정보를 불러오지 못했습니다."
            )
        }
    }

    function handleNewImageChange(event) {
        const selectedFiles = Array.from(
            event.target.files || []
        )

        event.target.value = ""

        if (selectedFiles.length === 0) return

        const currentImageCount =
            existingImages.length +
            newImages.length

        if (
            currentImageCount +
            selectedFiles.length >
            MAX_IMAGES
        ) {
            setFieldErrors((current) => ({
                ...current,
                images:
                    `이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`
            }))

            return
        }

        const invalidType = selectedFiles.find(
            (file) => (
                !ALLOWED_IMAGE_TYPES.includes(
                    file.type
                )
            )
        )

        if (invalidType) {
            setFieldErrors((current) => ({
                ...current,
                images:
                    "JPG, PNG, WEBP 이미지만 등록할 수 있습니다."
            }))

            return
        }

        const oversizedFile = selectedFiles.find(
            (file) => (
                file.size > MAX_FILE_SIZE
            )
        )

        if (oversizedFile) {
            setFieldErrors((current) => ({
                ...current,
                images:
                    "이미지는 한 장당 10MB 이하여야 합니다."
            }))

            return
        }

        const nextImages = selectedFiles.map(
            (file) => ({
                file,
                preview:
                    URL.createObjectURL(file)
            })
        )

        setNewImages((current) => [
            ...current,
            ...nextImages
        ])

        setFieldErrors((current) => ({
            ...current,
            images: ""
        }))
    }

    function handleRemoveExistingImage(imageUrlValue) {
        setExistingImages((current) => (
            current.filter(
                (url) => url !== imageUrlValue
            )
        ))

        setDeletedImageUrls((current) => (
            current.includes(imageUrlValue)
                ? current
                : [...current, imageUrlValue]
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
                URL.revokeObjectURL(
                    target.preview
                )
            }

            return current.filter(
                (_, imageIndex) => (
                    imageIndex !== index
                )
            )
        })
    }

    function showValidationError(
        field,
        message
    ) {
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
        const imageCount =
            existingImages.length +
            newImages.length

        if (imageCount < MIN_IMAGES) {
            return showValidationError(
                "images",
                "사진을 1장 이상 유지하거나 등록해 주세요."
            )
        }

        if (imageCount > MAX_IMAGES) {
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

        formData.append(
            "title",
            form.title.trim()
        )

        formData.append(
            "species",
            form.species
        )

        formData.append(
            "breed",
            form.breed.trim()
        )

        formData.append(
            "color",
            form.colors.join(",")
        )

        formData.append(
            "region",
            region
        )

        formData.append(
            "find_date",
            form.find_date
        )

        formData.append(
            "description",
            form.description.trim()
        )

        formData.append(
            "delete_image_urls",
            JSON.stringify(
                deletedImageUrls
            )
        )

        newImages.forEach(({ file }) => {
            formData.append(
                "images",
                file
            )
        })

        try {
            await updateFoundPost(
                id,
                formData
            )

            setAlertTitle("수정 완료")
            setAlertMessage(
                "발견제보가 수정되었습니다."
            )
            setAlertType("success")
            setAlertOpen(true)
        } catch (error) {
            setSubmitError(
                error.message ||
                "발견제보 수정에 실패했습니다."
            )
        } finally {
            setSubmitting(false)
        }
    }

    function handleAlertConfirm() {
        setAlertOpen(false)

        if (alertType === "success") {
            navigate(`/found-posts/${id}`)
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

    if (loading) {
        return (
            <Loading message="발견제보 정보를 불러오는 중입니다." />
        )
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

    return (
        <div className="container">
            <Breadcrumb
                items={[
                    {
                        label: "홈",
                        to: "/"
                    },
                    {
                        label: "발견제보",
                        to: "/found-posts"
                    },
                    {
                        label: "상세",
                        to: `/found-posts/${id}`
                    },
                    {
                        label: "수정"
                    }
                ]}
            />

            <div className="page-header">
                <h1 className="page-title">
                    발견제보 수정
                </h1>

                <p className="page-desc">
                    등록한 발견제보 정보를 수정할 수 있습니다.
                </p>
            </div>

            <form
                className="stack"
                onSubmit={handleSubmit}
                noValidate
            >
                <div className="card card-padded stack">
                    <div>
                        <h2>
                            사진 수정
                        </h2>

                        <p className="text-sub">
                            사진은 최소 1장, 최대 3장까지 유지할 수 있습니다.
                        </p>
                    </div>

                    <div
                        ref={(element) => (
                            setFieldRef(
                                "images",
                                element
                            )
                        )}
                        className="form-field"
                    >
                        <label
                            className="form-label"
                            htmlFor="found-edit-images"
                        >
                            사진 *
                        </label>

                        <input
                            id="found-edit-images"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={
                                handleNewImageChange
                            }
                            disabled={
                                existingImages.length +
                                newImages.length >=
                                MAX_IMAGES
                            }
                        />

                        <p className="text-sub">
                            {existingImages.length +
                                newImages.length}
                            {" / "}
                            {MAX_IMAGES}장
                        </p>

                        {fieldErrors.images && (
                            <p className="form-error">
                                {
                                    fieldErrors.images
                                }
                            </p>
                        )}
                    </div>

                    {existingImages.length > 0 && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: "12px"
                            }}
                        >
                            {existingImages.map(
                                (url, index) => (
                                    <div
                                        key={url}
                                        className="card"
                                    >
                                        <img
                                            src={
                                                imageUrl(
                                                    url
                                                )
                                            }
                                            alt={`기존 이미지 ${index + 1}`}
                                            style={{
                                                width:
                                                    "100%",
                                                aspectRatio:
                                                    "4 / 3",
                                                objectFit:
                                                    "cover"
                                            }}
                                        />

                                        <button
                                            type="button"
                                            className="btn btn-text btn-sm"
                                            onClick={() => (
                                                handleRemoveExistingImage(
                                                    url
                                                )
                                            )}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    )}

                    {newImages.length > 0 && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: "12px"
                            }}
                        >
                            {newImages.map(
                                (image, index) => (
                                    <div
                                        key={
                                            image.preview
                                        }
                                        className="card"
                                    >
                                        <img
                                            src={
                                                image.preview
                                            }
                                            alt={`새 이미지 ${index + 1}`}
                                            style={{
                                                width:
                                                    "100%",
                                                aspectRatio:
                                                    "4 / 3",
                                                objectFit:
                                                    "cover"
                                            }}
                                        />

                                        <button
                                            type="button"
                                            className="btn btn-text btn-sm"
                                            onClick={() => (
                                                handleRemoveNewImage(
                                                    index
                                                )
                                            )}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    )}
                </div>

                <div className="card card-padded stack">
                    <h2>
                        발견 정보
                    </h2>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-edit-title"
                        >
                            제목 *
                        </label>

                        <input
                            ref={(element) => (
                                setFieldRef(
                                    "title",
                                    element
                                )
                            )}
                            id="found-edit-title"
                            type="text"
                            className={`form-input ${
                                fieldErrors.title
                                    ? "is-error"
                                    : ""
                            }`}
                            value={form.title}
                            maxLength={100}
                            onChange={(event) => (
                                handleChange(
                                    "title",
                                    event.target.value
                                )
                            )}
                        />

                        {fieldErrors.title && (
                            <p className="form-error">
                                {
                                    fieldErrors.title
                                }
                            </p>
                        )}
                    </div>

                    <div
                        ref={(element) => (
                            setFieldRef(
                                "species",
                                element
                            )
                        )}
                        className="form-field"
                    >
                        <span className="form-label">
                            동물 종류 *
                        </span>

                        <div className="row">
                            {["개", "고양이"].map(
                                (species) => (
                                    <label
                                        key={
                                            species
                                        }
                                    >
                                        <input
                                            type="radio"
                                            name="found-edit-species"
                                            checked={
                                                form.species ===
                                                species
                                            }
                                            onChange={() => (
                                                handleSpeciesChange(
                                                    species
                                                )
                                            )}
                                        />

                                        {species}
                                    </label>
                                )
                            )}
                        </div>

                        {fieldErrors.species && (
                            <p className="form-error">
                                {
                                    fieldErrors.species
                                }
                            </p>
                        )}
                    </div>

                    <div
                        ref={(element) => (
                            setFieldRef(
                                "breed",
                                element
                            )
                        )}
                        className="form-field"
                    >
                        <label
                            className="form-label"
                            htmlFor="found-edit-breed"
                        >
                            품종 *
                        </label>

                        <input
                            id="found-edit-breed"
                            type="text"
                            className={`form-input ${
                                fieldErrors.breed
                                    ? "is-error"
                                    : ""
                            }`}
                            list="found-edit-breed-options"
                            value={form.breed}
                            disabled={
                                !form.species
                            }
                            onChange={(event) => (
                                handleChange(
                                    "breed",
                                    event.target.value
                                )
                            )}
                        />

                        <datalist id="found-edit-breed-options">
                            {breeds.map(
                                (breed) => (
                                    <option
                                        key={
                                            breed.id
                                        }
                                        value={
                                            breed.name
                                        }
                                    />
                                )
                            )}
                        </datalist>

                        {breedLoading && (
                            <p className="form-help">
                                품종을 불러오는 중입니다.
                            </p>
                        )}

                        {fieldErrors.breed && (
                            <p className="form-error">
                                {
                                    fieldErrors.breed
                                }
                            </p>
                        )}
                    </div>

                    <div
                        ref={(element) => (
                            setFieldRef(
                                "colors",
                                element
                            )
                        )}
                        className="form-field"
                    >
                        <span className="form-label">
                            색상 *
                        </span>

                        <div className="row">
                            {colorTags.map(
                                (color) => (
                                    <label
                                        key={color}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={
                                                form.colors.includes(
                                                    color
                                                )
                                            }
                                            onChange={() => (
                                                handleColorToggle(
                                                    color
                                                )
                                            )}
                                        />

                                        {color}
                                    </label>
                                )
                            )}
                        </div>

                        {fieldErrors.colors && (
                            <p className="form-error">
                                {
                                    fieldErrors.colors
                                }
                            </p>
                        )}
                    </div>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-edit-date"
                        >
                            발견 날짜 *
                        </label>

                        <input
                            ref={(element) => (
                                setFieldRef(
                                    "find_date",
                                    element
                                )
                            )}
                            id="found-edit-date"
                            type="date"
                            className={`form-input ${
                                fieldErrors.find_date
                                    ? "is-error"
                                    : ""
                            }`}
                            value={
                                form.find_date
                            }
                            max={getToday()}
                            onChange={(event) => (
                                handleChange(
                                    "find_date",
                                    event.target.value
                                )
                            )}
                        />

                        {fieldErrors.find_date && (
                            <p className="form-error">
                                {
                                    fieldErrors.find_date
                                }
                            </p>
                        )}
                    </div>
                </div>

                <div className="card card-padded stack">
                    <h2>
                        발견 위치
                    </h2>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-edit-sido"
                        >
                            시/도 *
                        </label>

                        <select
                            ref={(element) => (
                                setFieldRef(
                                    "sido",
                                    element
                                )
                            )}
                            id="found-edit-sido"
                            className={`form-select ${
                                fieldErrors.sido
                                    ? "is-error"
                                    : ""
                            }`}
                            value={form.sido}
                            onChange={(event) => (
                                handleSidoChange(
                                    event.target.value
                                )
                            )}
                        >
                            <option value="">
                                시/도 선택
                            </option>

                            {sidoList.map(
                                (sido) => (
                                    <option
                                        key={sido}
                                        value={sido}
                                    >
                                        {sido}
                                    </option>
                                )
                            )}
                        </select>

                        {fieldErrors.sido && (
                            <p className="form-error">
                                {
                                    fieldErrors.sido
                                }
                            </p>
                        )}
                    </div>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-edit-sigungu"
                        >
                            시/군/구 *
                        </label>

                        <select
                            ref={(element) => (
                                setFieldRef(
                                    "sigungu",
                                    element
                                )
                            )}
                            id="found-edit-sigungu"
                            className={`form-select ${
                                fieldErrors.sigungu
                                    ? "is-error"
                                    : ""
                            }`}
                            value={
                                form.sigungu
                            }
                            disabled={
                                !form.sido
                            }
                            onChange={(event) => (
                                handleChange(
                                    "sigungu",
                                    event.target.value
                                )
                            )}
                        >
                            <option value="">
                                시/군/구 선택
                            </option>

                            {sigunguList.map(
                                (sigungu) => (
                                    <option
                                        key={
                                            sigungu
                                        }
                                        value={
                                            sigungu
                                        }
                                    >
                                        {
                                            sigungu
                                        }
                                    </option>
                                )
                            )}
                        </select>

                        {fieldErrors.sigungu && (
                            <p className="form-error">
                                {
                                    fieldErrors.sigungu
                                }
                            </p>
                        )}
                    </div>

                    <div className="form-field">
                        <label
                            className="form-label"
                            htmlFor="found-edit-detail-region"
                        >
                            상세 위치 *
                        </label>

                        <input
                            ref={(element) => (
                                setFieldRef(
                                    "detail_region",
                                    element
                                )
                            )}
                            id="found-edit-detail-region"
                            type="text"
                            className={`form-input ${
                                fieldErrors.detail_region
                                    ? "is-error"
                                    : ""
                            }`}
                            value={
                                form.detail_region
                            }
                            onChange={(event) => (
                                handleChange(
                                    "detail_region",
                                    event.target.value
                                )
                            )}
                        />

                        {fieldErrors.detail_region && (
                            <p className="form-error">
                                {
                                    fieldErrors.detail_region
                                }
                            </p>
                        )}
                    </div>
                </div>

                <div className="card card-padded stack">
                    <h2>
                        상세 내용
                    </h2>

                    <textarea
                        className="form-textarea"
                        value={
                            form.description
                        }
                        onChange={(event) => (
                            handleChange(
                                "description",
                                event.target.value
                            )
                        )}
                    />
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
                        onClick={() => (
                            navigate(
                                `/found-posts/${id}`
                            )
                        )}
                        disabled={
                            submitting
                        }
                    >
                        취소
                    </button>

                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={
                            submitting
                        }
                    >
                        {submitting
                            ? "수정 중..."
                            : "수정 완료"}
                    </button>
                </div>
            </form>

            <AlertModal
                open={alertOpen}
                title={alertTitle}
                message={alertMessage}
                onConfirm={
                    handleAlertConfirm
                }
            />
        </div>
    )
}