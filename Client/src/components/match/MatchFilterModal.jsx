import { useEffect, useState } from "react"
import { getRegions } from "../../api/catalog.api.js"
import Modal from "../common/Modal.jsx"

export const EMPTY_MATCH_FILTERS = {
    sex: "",
    neuter: "",
    sido: "",
    sigungu: "",
    start_date: "",
    end_date: ""
}

const OPTIONS = {
    sex: [
        { value: "M", label: "수컷" },
        { value: "F", label: "암컷" },
        { value: "U", label: "미상" }
    ],
    neuter: [
        { value: "Y", label: "중성화 완료" },
        { value: "N", label: "중성화 안 됨" },
        { value: "U", label: "미상" }
    ]
}

export default function MatchFilterModal({ initialFilters, onClose, onApply, onReset }) {
    const [draft, setDraft] = useState(() => ({
        ...EMPTY_MATCH_FILTERS,
        ...initialFilters
    }))
    const [sidoList, setSidoList] = useState([])
    const [sigunguList, setSigunguList] = useState([])
    const [error, setError] = useState("")

    useEffect(() => {
        let cancelled = false
        getRegions()
            .then((result) => {
                if (!cancelled) setSidoList(result?.items ?? [])
            })
            .catch((err) => {
                if (!cancelled) setError(err.message || "지역 정보를 불러오지 못했습니다.")
            })
        return () => { cancelled = true }
    }, [])

    useEffect(() => {
        if (!draft.sido) {
            setSigunguList([])
            return
        }
        let cancelled = false
        getRegions({ parent: draft.sido })
            .then((result) => {
                if (!cancelled) setSigunguList(result?.items ?? [])
            })
            .catch((err) => {
                if (!cancelled) setError(err.message || "하위 지역을 불러오지 못했습니다.")
            })
        return () => { cancelled = true }
    }, [draft.sido])

    function setField(field, value) {
        setDraft((current) => ({ ...current, [field]: value }))
    }

    function setSido(value) {
        setDraft((current) => ({ ...current, sido: value, sigungu: "" }))
    }

    const footer = (
        <>
            <button
                type="button"
                className="btn btn-outline filter-reset-button"
                onClick={() => {
                    setDraft({ ...EMPTY_MATCH_FILTERS })
                    onReset()
                }}
            >
                필터 초기화
            </button>
            <button
                type="button"
                className="btn btn-primary filter-search-button"
                onClick={() => onApply(draft)}
            >
                <i className="ri-search-line" aria-hidden="true" />
                검색하기
            </button>
        </>
    )

    return (
        <Modal
            title="매칭 결과 필터"
            description="원하는 조건을 선택해 보호동물 후보를 좁혀보세요."
            className="filter-modal match-filter-modal"
            iconClose
            onClose={onClose}
            footer={footer}
        >
            <div className="filter-modal-content">
                {error && <p className="filter-error-message" role="alert">{error}</p>}

                <section className="filter-section">
                    <h3 className="filter-section-title">성별</h3>
                    <div className="filter-option-row">
                        <button
                            type="button"
                            className={!draft.sex ? "filter-pill is-selected" : "filter-pill"}
                            onClick={() => setField("sex", "")}
                        >전체</button>
                        {OPTIONS.sex.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                className={draft.sex === option.value ? "filter-pill is-selected" : "filter-pill"}
                                onClick={() => setField("sex", option.value)}
                            >{option.label}</button>
                        ))}
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">중성화 여부</h3>
                    <div className="filter-option-row">
                        <button
                            type="button"
                            className={!draft.neuter ? "filter-pill is-selected" : "filter-pill"}
                            onClick={() => setField("neuter", "")}
                        >전체</button>
                        {OPTIONS.neuter.map((option) => (
                            <button
                                type="button"
                                key={option.value}
                                className={draft.neuter === option.value ? "filter-pill is-selected" : "filter-pill"}
                                onClick={() => setField("neuter", option.value)}
                            >{option.label}</button>
                        ))}
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">지역</h3>
                    <div className="filter-grid">
                        <select className="filter-control" value={draft.sido} onChange={(event) => setSido(event.target.value)}>
                            <option value="">시/도 전체</option>
                            {sidoList.map((sido) => <option key={sido} value={sido}>{sido}</option>)}
                        </select>
                        <select
                            className="filter-control"
                            value={draft.sigungu}
                            disabled={!draft.sido}
                            onChange={(event) => setField("sigungu", event.target.value)}
                        >
                            <option value="">시/군/구 전체</option>
                            {sigunguList.map((sigungu) => <option key={sigungu} value={sigungu}>{sigungu}</option>)}
                        </select>
                    </div>
                </section>

                <section className="filter-section">
                    <h3 className="filter-section-title">발견 날짜</h3>
                    <div className="filter-grid">
                        <input
                            className="filter-control"
                            type="date"
                            value={draft.start_date}
                            max={draft.end_date || undefined}
                            onClick={(event) => event.currentTarget.showPicker?.()}
                            onChange={(event) => setField("start_date", event.target.value)}
                        />
                        <input
                            className="filter-control"
                            type="date"
                            value={draft.end_date}
                            min={draft.start_date || undefined}
                            onClick={(event) => event.currentTarget.showPicker?.()}
                            onChange={(event) => setField("end_date", event.target.value)}
                        />
                    </div>
                </section>
            </div>
        </Modal>
    )
}
