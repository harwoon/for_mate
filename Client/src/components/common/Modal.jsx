// 필터, 신고, 안내 등에 공통으로 쓰는 모달 틀
export default function Modal({ title, onClose, children, footer }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      {/* 안쪽을 눌렀을 때 닫히지 않도록 이벤트 전파를 막는다 */}
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-text" onClick={onClose}>닫기</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
