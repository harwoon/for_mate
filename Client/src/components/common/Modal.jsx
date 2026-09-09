// 필터, 신고, 안내 등에 공통으로 쓰는 모달 틀
export default function Modal({
    title,
    description,
    onClose,
    children,
    footer,
    className = "",
    iconClose = false
}) {
    return (
        <div
            className="modal-backdrop"
            onClick={onClose}
        >
            {/* 안쪽을 눌렀을 때 닫히지 않도록 이벤트 전파를 막는다 */}
            <div
                className={`modal ${className}`}
                onClick={(event) => event.stopPropagation()}
            >
                <div className="modal-header">
                    <div className="modal-heading">
                        <h2 className="modal-title">
                            {title}
                        </h2>

                        {description && (
                            <p className="modal-description">
                                {description}
                            </p>
                        )}
                    </div>

                    <button
                        type="button"
                        className={
                            iconClose
                                ? "modal-close-button"
                                : "btn btn-text"
                        }
                        onClick={onClose}
                        aria-label="닫기"
                    >
                        {iconClose ? (
                            <i
                                className="ri-close-line"
                                aria-hidden="true"
                            />
                        ) : (
                            "닫기"
                        )}
                    </button>
                </div>

                <div className="modal-body">
                    {children}
                </div>

                {footer && (
                    <div className="modal-footer">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    )
}