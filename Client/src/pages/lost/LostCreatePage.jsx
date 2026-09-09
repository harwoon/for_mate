import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { createLostPost } from "../../api/lostPosts.api.js"
import { getBreeds, getColorTags, getRegions } from "../../api/catalog.api.js"
import AlertModal from "../../components/common/AlertModal.jsx"

const EMPTY_FORM = {
    pet_name: "",
    species: "",
    breed: "",
    color: "",
    sex: "",
    neuter_yn: "",
    sido: "",
    sigungu: "",
    detail_region: "",
    event_date: "",
    description: ""
}

const EMPTY_ERRORS = {
    pet_name: "",
    species: "",
    region: "",
    event_date: "",
    images: ""
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

export default function LostCreatePage() {
    const navigate = useNavigate()
    const imagesRef = useRef([])

    const [form, setForm] = useState(EMPTY_FORM)
    const [fieldErrors, setFieldErrors] = useState(EMPTY_ERRORS)

    const [images, setImages] = useState([])
    const [breeds, setBreeds] = useState([])
    const [colorTags, setColorTags] = useState([])
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])

    const [breedLoading, setBreedLoading] = useState(false)
    const [optionError, setOptionError] = useState("")
    const [submitError, setSubmitError] = useState("")
    const [submitting, setSubmitting] = useState(false)

    const [alertOpen, setAlertOpen] = useState(false)
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
                    setOptionError(error.message || "선택 정보를 불러오지 못했습니다.")
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
                    setOptionError(error.message || "지역 정보를 불러오지 못했습니다.")
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
            imagesRef.current.forEach((image) => {
                URL.revokeObjectURL(image.preview)
            })
        }
    }, [])

    function handleChange(field, value) {
        setForm((current) => ({ ...current, [field]: value }))

        if (fieldErrors[field]) {
            setFieldErrors((current) => ({
                ...current,
                [field]: ""
            }))
        }

        if (
            ["sido", "sigungu", "detail_region"].includes(field) &&
            fieldErrors.region
        ) {
            setFieldErrors((current) => ({
                ...current,
                region: ""
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

        if (fieldErrors.species) {
            setFieldErrors((current) => ({
                ...current,
                species: ""
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

        if (fieldErrors.region) {
            setFieldErrors((current) => ({
                ...current,
                region: ""
            }))
        }
    }

    function handleImageChange(event) {
        const selectedFiles = Array.from(event.target.files || [])
        event.target.value = ""

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

        setImages((current) => [...current, ...nextImages])

        setFieldErrors((current) => ({
            ...current,
            images: ""
        }))
    }

    function handleRemoveImage(index) {
        setImages((current) => {
            const target = current[index]

            if (target) {
                URL.revokeObjectURL(target.preview)
            }

            return current.filter((_, imageIndex) => imageIndex !== index)
        })
    }

    function validate() {
        const nextErrors = { ...EMPTY_ERRORS }

        const region = [
            form.sido,
            form.sigungu,
            form.detail_region.trim()
        ]
            .filter(Boolean)
            .join(" ")

        if (images.length < MIN_IMAGES) {
            nextErrors.images = `이미지를 ${MIN_IMAGES}장 이상 등록해 주세요.`
            setFieldErrors(nextErrors)
            return false
        }

        if (images.length > MAX_IMAGES) {
            nextErrors.images = `이미지는 최대 ${MAX_IMAGES}장까지 등록할 수 있습니다.`
            setFieldErrors(nextErrors)
            return false
        }

        if (!form.pet_name.trim()) {
            nextErrors.pet_name = "반려동물 이름을 입력해 주세요."
            setFieldErrors(nextErrors)
            return false
        }

        if (!form.species) {
            nextErrors.species = "동물 종류를 선택해 주세요."
            setFieldErrors(nextErrors)
            return false
        }

        if (!region) {
            nextErrors.region = "실종 위치를 입력해 주세요."
            setFieldErrors(nextErrors)
            return false
        }

        if (!form.event_date) {
            nextErrors.event_date = "실종 날짜를 선택해 주세요."
            setFieldErrors(nextErrors)
            return false
        }

        setFieldErrors(nextErrors)
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
        formData.append("region", region)
        formData.append("event_date", form.event_date)

        if (form.breed.trim()) {
            formData.append("breed", form.breed.trim())
        }

        if (form.color) {
            formData.append("color", form.color)
        }

        if (form.sex) {
            formData.append("sex", form.sex)
        }

        if (form.neuter_yn) {
            formData.append("neuter_yn", form.neuter_yn)
        }

        if (form.description.trim()) {
            formData.append("description", form.description.trim())
        }

        images.forEach(({ file }) => {
            formData.append("images", file)
        })

        try {
            const createdPost = await createLostPost(formData)

            setCreatedPostId(createdPost.id)
            setAlertOpen(true)
        } catch (error) {
            setSubmitError(error.message || "실종 공고 등록에 실패했습니다.")
        } finally {
            setSubmitting(false)
        }
    }

    function handleAlertConfirm() {
        setAlertOpen(false)

        navigate("/ai-search", {
            state: { lostPostId: createdPostId }
        })
    }

    const noBreedResult =
        form.species &&
        form.breed.trim() &&
        !breedLoading &&
        breeds.length === 0

    return (
        <div className="container">
            <div className="page-header">
                <h1 className="page-title">실종 공고 등록</h1>
                <p className="page-desc">
                    잃어버린 반려동물의 정보를 최대한 자세히 입력해 주세요.
                </p>
            </div>

            <form className="stack" onSubmit={handleSubmit} noValidate>
                <div className="card card-padded stack">
                    <div>
                        <h2>사진 등록</h2>

                        <p className="text-sub">
                            최소 3장, 최대 8장까지 등록할 수 있으며 첫 번째 사진이 대표 이미지로 사용됩니다.
                        </p>
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="lost-images">
                            사진
                        </label>

                        <input
                            id="lost-images"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={handleImageChange}
                            disabled={images.length >= MAX_IMAGES}
                        />

                        <p className="text-sub">
                            {images.length} / {MAX_IMAGES}장
                        </p>

                        {fieldErrors.images && (
                            <p className="form-error">
                                {fieldErrors.images}
                            </p>
                        )}
                    </div>

                    {images.length > 0 && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                                gap: "12px"
                            }}
                        >
                            {images.map((image, index) => (
                                <div
                                    key={`${image.file.name}-${image.file.lastModified}-${index}`}
                                >
                                    <div style={{ position: "relative" }}>
                                        <img
                                            src={image.preview}
                                            alt={`등록 이미지 ${index + 1}`}
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
                                        onClick={() => handleRemoveImage(index)}
                                    >
                                        삭제
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="card card-padded stack">
                    <h2>동물 정보</h2>

                    <div className="form-field">
                        <label className="form-label" htmlFor="pet-name">
                            이름 *
                        </label>

                        <input
                            id="pet-name"
                            type="text"
                            className={`form-input${fieldErrors.pet_name ? " is-error" : ""}`}
                            value={form.pet_name}
                            maxLength={50}
                            placeholder="반려동물 이름을 입력해 주세요"
                            onChange={(event) => handleChange("pet_name", event.target.value)}
                        />

                        {fieldErrors.pet_name && (
                            <p className="form-error">
                                {fieldErrors.pet_name}
                            </p>
                        )}
                    </div>

                    <fieldset>
                        <legend>종류 *</legend>

                        <label>
                            <input
                                type="radio"
                                name="species"
                                value="개"
                                checked={form.species === "개"}
                                onChange={() => handleSpeciesChange("개")}
                            />
                            개
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="species"
                                value="고양이"
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
                        <label className="form-label" htmlFor="breed">
                            품종
                        </label>

                        <input
                            id="breed"
                            type="text"
                            className="form-input"
                            list="lost-breed-options"
                            value={form.breed}
                            disabled={!form.species}
                            placeholder={
                                form.species
                                    ? "품종을 입력하거나 선택해 주세요"
                                    : "동물 종류를 먼저 선택해 주세요"
                            }
                            onChange={(event) => handleChange("breed", event.target.value)}
                        />

                        <datalist id="lost-breed-options">
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
                    </div>

                    <div className="form-field">
                        <label className="form-label" htmlFor="color">
                            털 색상
                        </label>

                        <select
                            id="color"
                            className="form-select"
                            value={form.color}
                            onChange={(event) => handleChange("color", event.target.value)}
                        >
                            <option value="">선택하지 않음</option>

                            {colorTags.map((color) => (
                                <option key={color} value={color}>
                                    {color}
                                </option>
                            ))}
                        </select>
                    </div>

                    <fieldset>
                        <legend>성별</legend>

                        <label>
                            <input
                                type="radio"
                                name="sex"
                                checked={form.sex === "M"}
                                onChange={() => handleChange("sex", "M")}
                            />
                            수컷
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="sex"
                                checked={form.sex === "F"}
                                onChange={() => handleChange("sex", "F")}
                            />
                            암컷
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="sex"
                                checked={form.sex === "Q"}
                                onChange={() => handleChange("sex", "Q")}
                            />
                            미상
                        </label>
                    </fieldset>

                    <fieldset>
                        <legend>중성화 여부</legend>

                        <label>
                            <input
                                type="radio"
                                name="neuter"
                                checked={form.neuter_yn === "Y"}
                                onChange={() => handleChange("neuter_yn", "Y")}
                            />
                            중성화 완료
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="neuter"
                                checked={form.neuter_yn === "N"}
                                onChange={() => handleChange("neuter_yn", "N")}
                            />
                            중성화 안 됨
                        </label>

                        <label>
                            <input
                                type="radio"
                                name="neuter"
                                checked={form.neuter_yn === "U"}
                                onChange={() => handleChange("neuter_yn", "U")}
                            />
                            미상
                        </label>
                    </fieldset>
                </div>

                <div className="card card-padded stack">
                    <h2>실종 정보</h2>

                    <fieldset>
                        <legend>실종 위치 *</legend>

                        <div className="form-field">
                            <label className="form-label" htmlFor="sido">
                                시/도
                            </label>

                            <select
                                id="sido"
                                className="form-select"
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
                        </div>

                        <div className="form-field">
                            <label className="form-label" htmlFor="sigungu">
                                시/군/구
                            </label>

                            <select
                                id="sigungu"
                                className="form-select"
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
                        </div>

                        <div className="form-field">
                            <label className="form-label" htmlFor="detail-region">
                                상세 위치
                            </label>

                            <input
                                id="detail-region"
                                type="text"
                                className={`form-input${fieldErrors.region ? " is-error" : ""}`}
                                value={form.detail_region}
                                placeholder="예: 역삼역 1번 출구 근처"
                                onChange={(event) => handleChange("detail_region", event.target.value)}
                            />

                            {fieldErrors.region && (
                                <p className="form-error">
                                    {fieldErrors.region}
                                </p>
                            )}
                        </div>
                    </fieldset>

                    <div className="form-field">
                        <label className="form-label" htmlFor="event-date">
                            실종 날짜 *
                        </label>

                        <input
                            id="event-date"
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
                        <label className="form-label" htmlFor="description">
                            특징
                        </label>

                        <textarea
                            id="description"
                            className="form-textarea"
                            value={form.description}
                            placeholder="외형, 성격, 목걸이 착용 여부 등 특징을 입력해 주세요"
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

                <button
                    type="submit"
                    className="btn btn-primary btn-block"
                    disabled={submitting}
                >
                    {submitting ? "등록 중..." : "실종 공고 등록"}
                </button>
            </form>

            <AlertModal
                open={alertOpen}
                title="등록 완료"
                message="실종 공고가 등록되었습니다."
                onConfirm={handleAlertConfirm}
            />
        </div>
    )
}