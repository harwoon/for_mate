// 요청이 실패했을 때 보여준다. (피그마 S-00 ERROR STATE)
export default function ErrorState({ message = "오류가 발생하여 페이지를 새로고침할 수 없습니다", onRetry }) {
  return (
    <div className="state-box">
      <p>{message}</p>
      {onRetry && (
        <button className="btn btn-outline" onClick={onRetry}>다시 시도</button>
      )}
    </div>
  )
}
