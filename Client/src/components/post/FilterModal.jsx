import { useEffect, useState } from "react"
import {
    getBreeds,
    getColorTags,
    getRegions
} from "../../api/catalog.api.js"
import Modal from "../common/Modal.jsx"

const EMPTY_FILTERS = {
    species: "",
    breed: "",
    colors: [],
    sido: "",
    sigungu: "",
    start_date: "",
    end_date: ""
}

// 부모에서 받은 필터를 모달 내부에서 안전하게 수정할 수 있도록 새 객체로 만든다.
function createDraftFilters(filters = {}) {
    return {
        ...EMPTY_FILTERS,
        ...filters,
        colors: Array.isArray(filters.colors)
            ? [...filters.colors]
            : []
    }
}

function getColorDotClass(color) {
    const value = String(color)

    if (
        value.includes("흰") ||
        value.includes("백")
    ) {
        return "is-white"
    }

    if (
        value.includes("검") ||
        value.includes("흑")
    ) {
        return "is-black"
    }

    if (
        value.includes("갈") ||
        value.includes("브라운")
    ) {
        return "is-brown"
    }

    if (
        value.includes("황") ||
        value.includes("노랑")
    ) {
        return "is-yellow"
    }

    if (
        value.includes("회") ||
        value.includes("그레이")
    ) {
        return "is-gray"
    }

    if (
        value.includes("크림") ||
        value.includes("베이지")
    ) {
        return "is-cream"
    }

    return "is-other"
}

// 종류 / 품종 / 색상 / 지역 / 날짜를 고르는 필터 모달
// 검색하기를 누르기 전까지는 draftFilters만 변경하므로 목록에 즉시 반영되지 않는다.
export default function FilterModal({
    initialFilters = EMPTY_FILTERS,
    dateTitle = "실종 날짜",
    onClose,
    onApply,
    onReset
}) {
    const [draftFilters, setDraftFilters] = useState(
        () => createDraftFilters(initialFilters)
    )
    const [breedKeyword, setBreedKeyword] = useState(
        initialFilters.breed || ""
    )
    const [breeds, setBreeds] = useState([])
    const [colorTags, setColorTags] = useState([])
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    // 모달이 처음 나타날 때 서로 의존하지 않는 색상과 시/도 목록을 동시에 조회한다.
    useEffect(() => {
        let cancelled = false

        async function loadInitialOptions() {
            setLoading(true)
            setError("")

            try {
                const [
                    colorResult,
                    regionResult
                ] = await Promise.all([
                    getColorTags(),
                    getRegions()
                ])

                if (cancelled) return

                setColorTags(
                    colorResult?.items ?? []
                )

                setSidoList(
                    regionResult?.items ?? []
                )
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.message ||
                        "필터 정보를 불러오지 못했습니다."
                    )
                }
            } finally {
                if (!cancelled) {
                    setLoading(false)
                }
            }
        }

        loadInitialOptions()

        return () => {
            cancelled = true
        }
    }, [])

    // 적용된 필터에 시/도가 있다면 모달을 다시 열었을 때 해당 시/군/구 목록도 복원한다.
    useEffect(() => {
        if (!draftFilters.sido) {
            setSigunguList([])
            return
        }

        let cancelled = false

        getRegions({
            parent: draftFilters.sido
        })
            .then((result) => {
                if (!cancelled) {
                    setSigunguList(
                        result?.items ?? []
                    )
                }
            })
            .catch((err) => {
                if (!cancelled) {
                    setError(
                        err.message ||
                        "하위 지역을 불러오지 못했습니다."
                    )
                }
            })

        return () => {
            cancelled = true
        }
    }, [draftFilters.sido])

    // 동물 종류나 품종 검색어가 바뀌면 잠시 기다린 뒤 자동완성 후보를 조회한다.
    useEffect(() => {
        let cancelled = false

        async function loadBreeds() {
            try {
                const result = await getBreeds({
                    species: draftFilters.species,
                    keyword: breedKeyword.trim()
                })

                if (!cancelled) {
                    setBreeds(
                        result?.items ?? []
                    )
                }
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err.message ||
                        "품종 목록을 불러오지 못했습니다."
                    )
                }
            }
        }

        const timer = setTimeout(
            loadBreeds,
            250
        )

        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [
        draftFilters.species,
        breedKeyword
    ])

    function handleSpeciesChange(species) {
        // 종류가 바뀌면 기존 품종이 새 종류와 맞지 않을 수 있으므로 함께 초기화한다.
        setDraftFilters((current) => ({
            ...current,
            species,
            breed: ""
        }))

        setBreedKeyword("")
    }

    function handleBreedChange(value) {
        setBreedKeyword(value)

        setDraftFilters((current) => ({
            ...current,
            breed: value
        }))
    }

    function handleColorToggle(color) {
        setDraftFilters((current) => {
            const selected =
                current.colors.includes(color)

            const colors = selected
                ? current.colors.filter(
                    (item) => item !== color
                )
                : [
                    ...current.colors,
                    color
                ]

            return {
                ...current,
                colors
            }
        })
    }

    function handleSidoChange(sido) {
        // 상위 지역이 바뀌면 이전 하위 지역 선택을 제거한다.
        setDraftFilters((current) => ({
            ...current,
            sido,
            sigungu: ""
        }))
    }

    function handleFieldChange(
        field,
        value
    ) {
        setDraftFilters((current) => ({
            ...current,
            [field]: value
        }))
    }

    function handleApply() {
        if (
            draftFilters.start_date &&
            draftFilters.end_date &&
            draftFilters.start_date >
                draftFilters.end_date
        ) {
            setError(
                "시작일은 종료일보다 늦을 수 없습니다."
            )

            return
        }

        setError("")

        onApply?.(
            createDraftFilters(
                draftFilters
            )
        )
    }

    function handleReset() {
        const emptyFilters =
            createDraftFilters()

        setDraftFilters(emptyFilters)
        setBreedKeyword("")
        setBreeds([])
        setSigunguList([])
        setError("")

        onReset?.(emptyFilters)
    }

    return (
        <Modal
            title="필터"
            description="원하는 조건을 선택하여 맞춤 공고를 찾아보세요."
            onClose={onClose}
            className="filter-modal"
            iconClose
            footer={
                <>
                    <button
                        type="button"
                        className="btn btn-outline filter-reset-button"
                        onClick={handleReset}
                    >
                        필터 초기화
                    </button>

                    <button
                        type="button"
                        className="btn btn-primary filter-search-button"
                        onClick={handleApply}
                    >
                        <i
                            className="ri-search-line"
                            aria-hidden="true"
                        />
                        검색하기
                    </button>
                </>
            }
        >
            <div className="filter-modal-content">
                {loading && (
                    <p className="filter-state-message">
                        필터 정보를 불러오는 중입니다.
                    </p>
                )}

                {error && (
                    <p
                        className="filter-error-message"
                        role="alert"
                    >
                        {error}
                    </p>
                )}

                <section className="filter-section">
                    <h3 className="filter-section-title">
                        종류
                    </h3>

                    <div className="filter-option-row">
                        {[
                            ["", "전체"],
                            ["개", "개"],
                            ["고양이", "고양이"]
                        ].map(([value, label]) => {
                            const selected =
                                draftFilters.species ===
                                value

                            return (
                                <label
                                    key={label}
                                    className={
                                        selected
                                            ? "filter-pill is-selected"
                                            : "filter-pill"
                                    }
                                >
                                    <input
                                        type="radio"
                                        name="species"
                                        value={value}
                                        checked={selected}
                                        onChange={() => (
                                            handleSpeciesChange(
                                                value
                                            )
                                        )}
                                    />

                                    <span>
                                        {label}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">
                        품종
                    </h3>

                    <input
                        className="filter-control"
                        type="text"
                        list="breed-options"
                        value={breedKeyword}
                        placeholder="품종을 입력하거나 선택하세요"
                        onChange={(event) => (
                            handleBreedChange(
                                event.target.value
                            )
                        )}
                    />

                    <datalist id="breed-options">
                        {breeds.map((breed) => (
                            <option
                                key={breed.id}
                                value={breed.name}
                            >
                                {breed.species}
                            </option>
                        ))}
                    </datalist>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">
                        색상
                    </h3>

                    <div className="filter-color-row">
                        {colorTags.map((color) => {
                            const selected =
                                draftFilters.colors.includes(
                                    color
                                )

                            return (
                                <label
                                    key={color}
                                    className={
                                        selected
                                            ? "filter-color-pill is-selected"
                                            : "filter-color-pill"
                                    }
                                >
                                    <input
                                        type="checkbox"
                                        checked={selected}
                                        onChange={() => (
                                            handleColorToggle(
                                                color
                                            )
                                        )}
                                    />

                                    <span
                                        className={
                                            `filter-color-dot ${getColorDotClass(
                                                color
                                            )}`
                                        }
                                    />

                                    <span>
                                        {color}
                                    </span>
                                </label>
                            )
                        })}
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">
                        지역
                    </h3>

                    <div className="filter-grid">
                        <select
                            className="filter-control"
                            value={draftFilters.sido}
                            onChange={(event) => (
                                handleSidoChange(
                                    event.target.value
                                )
                            )}
                        >
                            <option value="">
                                시/도 전체
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

                        <select
                            className="filter-control"
                            value={draftFilters.sigungu}
                            disabled={!draftFilters.sido}
                            onChange={(event) => (
                                handleFieldChange(
                                    "sigungu",
                                    event.target.value
                                )
                            )}
                        >
                            <option value="">
                                시/군/구 전체
                            </option>

                            {sigunguList.map(
                                (sigungu) => (
                                    <option
                                        key={sigungu}
                                        value={sigungu}
                                    >
                                        {sigungu}
                                    </option>
                                )
                            )}
                        </select>
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">
                        {dateTitle}
                    </h3>

                    <div className="filter-grid">
                        <input
                            className="filter-control"
                            type="date"
                            value={
                                draftFilters.start_date
                            }
                            max={
                                draftFilters.end_date ||
                                undefined
                            }
                            onChange={(event) => (
                                handleFieldChange(
                                    "start_date",
                                    event.target.value
                                )
                            )}
                        />

                        <input
                            className="filter-control"
                            type="date"
                            value={
                                draftFilters.end_date
                            }
                            min={
                                draftFilters.start_date ||
                                undefined
                            }
                            onChange={(event) => (
                                handleFieldChange(
                                    "end_date",
                                    event.target.value
                                )
                            )}
                        />
                    </div>
                </section>
            </div>
        </Modal>
    )
}