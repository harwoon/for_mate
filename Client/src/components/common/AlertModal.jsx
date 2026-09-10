import { useEffect, useRef } from "react"
import "../../css/components/AlertModal.css"

export default function AlertModal({
    open,
    title = "알림",
    message,
    confirmText = "확인",
    onConfirm
}) {
    const confirmButtonRef = useRef(null)

    useEffect(() => {
        if (!open) return

        confirmButtonRef.current?.focus()

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                onConfirm()
            }
        }

        document.addEventListener("keydown", handleKeyDown)

        return () => {
            document.removeEventListener("keydown", handleKeyDown)
        }
    }, [open, onConfirm])

    if (!open) return null

    return (
        <div className="alert-modal-overlay">
            <div
                className="alert-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="alert-modal-title"
            >
                <div className="alert-modal-body">
                    <div className="alert-modal-icon">✓</div>

                    <h2 id="alert-modal-title" className="alert-modal-title">
                        {title}
                    </h2>

                    <p className="alert-modal-message">
                        {message}
                    </p>
                </div>

                <div className="alert-modal-actions">
                    <button
                        ref={confirmButtonRef}
                        type="button"
                        className="btn btn-primary alert-modal-confirm"
                        onClick={onConfirm}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    )
}