// 데이터를 불러오는 중일 때 보여준다. (피그마 S-00 LOADING STATE)
export default function Loading({ message = "불러오는 중..." }) {
  return (
    <div className="state-box">
      <p>{message}</p>
    </div>
  )
}
