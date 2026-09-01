// 목록이 비었을 때 보여준다. (피그마 S-00 EMPTY STATE)
export default function Empty({ message = "여기에 보여줄 내역이 아직 없어요", action }) {
  return (
    <div className="state-box">
      <p>{message}</p>
      {action}
    </div>
  )
}
