// 카드 여러 장을 격자로 배치한다 (반응형은 CSS에서 처리)
export default function PostGrid({ children }) {
  return <div className="card-grid">{children}</div>
}
