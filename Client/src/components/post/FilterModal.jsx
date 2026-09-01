import Modal from "../common/Modal.jsx"

// 종류 / 품종 / 색상 / 지역을 고르는 필터 모달
// TODO: catalog API(/breeds, /color-tags, /regions)로 선택지를 불러와 채운다
export default function FilterModal({ onClose, onApply, onReset }) {
  return (
    <Modal
      title="필터"
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onReset}>필터 초기화</button>
          <button className="btn btn-primary" onClick={onApply}>검색하기</button>
        </>
      }
    >
      <div className="stack">
        {/* TODO: 종류(전체/개/고양이) 선택 */}
        {/* TODO: 품종 자동완성 (getBreeds) */}
        {/* TODO: 색상 태그 칩 (getColorTags) */}
        {/* TODO: 지역 2단 드롭다운 (getRegions) */}
        <p className="text-sub">필터 항목을 여기에 추가하세요.</p>
      </div>
    </Modal>
  )
}
