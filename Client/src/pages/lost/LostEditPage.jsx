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
const MIN_IMAGES = 3
const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"]

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
                const [postResult, colorResult, regionResult] = await Promise.all([
                    getLostPost(id),
                    getColorTags(),
                    getRegions()
                ])

                if (cancelled) return

                if (!postResult?.is_owner) {
                    setError("실종 공고를 수정할 권한이 없습니다.")
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
                    setError(error.message || "실종 공고 정보를 불러오지 못했습니다.")
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

    function handleNewImageChange(event) {
        const selectedFiles = Array.from(event.target.files || [])
        event.target.value = ""

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
            setAlertMessage("실종 공고가 수정되었습니다.")
            setAlertType("success")
            setAlertOpen(true)
        } catch (error) {
            setSubmitError(error.message || "실종 공고 수정에 실패했습니다.")
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
        return <Loading message="실종 공고 정보를 불러오는 중입니다." />
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
                <h1 className="page-title">실종 공고 수정</h1>

                <p className="page-desc">
                    등록한 실종동물 정보를 수정해 주세요.
                </p>
            </div>

            <form className="stack" onSubmit={handleSubmit} noValidate>
                <div className="card card-padded stack">
                    <div>
                        <h2>사진 수정</h2>

                        <p className="text-sub">
                            수정 후에도 최소 3장, 최대 8장의 사진이 있어야 합니다.
                        </p>
                    </div>

                    <div
                        className="form-field"
                        ref={(element) => setFieldRef("images", element)}
                    >
                        <label className="form-label" htmlFor="lost-edit-images">
                            사진 *
                        </label>

                        <input
                            id="lost-edit-images"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleNewImageChange}
                            disabled={imageCount >= MAX_IMAGES}
                        />

                        <p className="text-sub">
                            {imageCount} / {MAX_IMAGES}장
                        </p>

                        {fieldErrors.images && (
                            <p className="form-error">
                                {fieldErrors.images}
                            </p>
                        )}
                    </div>

                    {existingImages.length > 0 && (
                        <div>
                            <p className="form-label">기존 사진</p>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                    gap: "12px"
                                }}
                            >
                                {existingImages.map((image, index) => (
                                    <div key={image.id}>
                                        <div style={{ position: "relative" }}>
                                            <img
                                                src={image.image_url}
                                                alt={`기존 이미지 ${index + 1}`}
                                                style={{
                                                    width: "100%",
                                                    aspectRatio: "1 / 1",
                                                    objectFit: "cover",
                                                    borderRadius: "8px"
                                                }}
                                            />

                                            {index === 0 && (
                                                <span
                                                    className="badge"
                                                    style={{
                                                        position: "absolute",
                                                        top: "8px",
                                                        left: "8px"
                                                    }}
                                                >
                                                    대표
                                                </span>
                                            )}
                                        </div>

                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{
                                                width: "100%",
                                                marginTop: "8px"
                                            }}
                                            onClick={() => handleRemoveExistingImage(image.id)}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {newImages.length > 0 && (
                        <div>
                            <p className="form-label">새로 추가한 사진</p>

                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                    gap: "12px"
                                }}
                            >
                                {newImages.map((image, index) => (
                                    <div
                                        key={`${image.file.name}-${image.file.lastModified}-${index}`}
                                    >
                                        <img
                                            src={image.preview}
                                            alt={`새 이미지 ${index + 1}`}
                                            style={{
                                                width: "100%",
                                                aspectRatio: "1 / 1",
                                                objectFit: "cover",
                                                borderRadius: "8px"
                                            }}
                                        />

                                        <button
                                            type="button"
                                            className="btn btn-outline"
                                            style={{
                                                width: "100%",
                                                marginTop: "8px"
                                            }}
                                            onClick={() => handleRemoveNewImage(index)}
                                        >
                                            삭제
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="card card-padded stack">
                    <h2>동물 정보</h2>

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

                    <fieldset ref={(element) => setFieldRef("species", element)}>
                        <legend>종류 *</legend>

                        <label>
                            <input
                                type="radio"
                                name="edit-species"
                                checked={form.species === "개"}
                                onChange={() => handleSpeciesChange("개")}
                            />
                            개
                        </label>

                        <label>
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

                    <div className="form-field">
                        <label className="form-label" htmlFor="edit-breed">
                            품종 *
                        </label>

                        <input
                            ref={(element) => setFieldRef("breed", element)}
                            id="edit-breed"
                            type="text"
                            className={`form-input${fieldErrors.breed ? " is-error" : ""}`}
                            list="lost-edit-breed-options"
                            value={form.breed}
                            disabled={!form.species}
                            onChange={(event) => handleChange("breed", event.target.value)}
                        />

                        <datalist id="lost-edit-breed-options">
                            {breeds.map((breed) => (
                                <option key={breed.id} value={breed.name} />
                            ))}
                        </datalist>

                        {breedLoading && (
                            <p className="text-sub">
                                품종을 검색하는 중입니다.
                            </p>
                        )}

                        {noBreedResult && (
                            <p className="text-sub">
                                없는 품종입니다.
                            </p>
                        )}

                        {fieldErrors.breed && (
                            <p className="form-error">
                                {fieldErrors.breed}
                            </p>
                        )}
                    </div>

                    <fieldset ref={(element) => setFieldRef("colors", element)}>
                        <legend>털 색상 *</legend>

                        {colorTags.map((color) => (
                            <label key={color}>
                                <input
                                    type="checkbox"
                                    checked={form.colors.includes(color)}
                                    onChange={() => handleColorToggle(color)}
                                />
                                {color}
                            </label>
                        ))}

                        {fieldErrors.colors && (
                            <p className="form-error">
                                {fieldErrors.colors}
                            </p>
                        )}
                    </fieldset>

                    <fieldset ref={(element) => setFieldRef("sex", element)}>
                        <legend>성별 *</legend>

                        <label>
                            <input
                                type="radio"
                                name="edit-sex"
                                checked={form.sex === "M"}
                                onChange={() => handleChange("sex", "M")}
                            />
                            수컷
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="edit-sex"
                                checked={form.sex === "F"}
                                onChange={() => handleChange("sex", "F")}
                            />
                            암컷
                        </label>

                        <label>
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

                    <fieldset ref={(element) => setFieldRef("neuter_yn", element)}>
                        <legend>중성화 여부 *</legend>

                        <label>
                            <input
                                type="radio"
                                name="edit-neuter"
                                checked={form.neuter_yn === "Y"}
                                onChange={() => handleChange("neuter_yn", "Y")}
                            />
                            중성화 완료
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="edit-neuter"
                                checked={form.neuter_yn === "N"}
                                onChange={() => handleChange("neuter_yn", "N")}
                            />
                            중성화 안 됨
                        </label>

                        <label>
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