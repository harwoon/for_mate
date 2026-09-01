// 실종 / 보호중 / 보호종료 예정 표시
export default function Badge({ type = "lost", children }) {
  return <span className={`badge badge-${type}`}>{children}</span>
}
