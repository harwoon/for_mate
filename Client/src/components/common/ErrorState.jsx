export default function ErrorState({
    message = "오류가 발생하여 페이지를 새로고침할 수 없습니다",
    onRetry,
    onHome
}) {
    return (
        <div className="state-box">
            <p>{message}</p>

            <div className="row">
                {onRetry && (
                    <button
                        type="button"
                        className="btn btn-outline"
                        onClick={onRetry}
                    >
                        다시 시도
                    </button>
                )}

                {onHome && (
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={onHome}
                    >
                        홈으로 돌아가기
                    </button>
                )}
            </div>
        </div>
    )
}