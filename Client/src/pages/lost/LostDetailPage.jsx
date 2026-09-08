// 피그마: U-03 / U-04 상세
//
// 구현할 내용:
// - getLostPost(id)로 상세 조회
// - 사진 슬라이드 (N/M 표시)
// - is_owner=true면 '공고 수정' / 'AI 매칭 요청' 버튼 (U-04)
// - is_owner=false면 '신고하기' 버튼 → ReportModal (U-03-01)

import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { deleteLostPost, getLostPost } from "../../api/lostPosts.api.js"
import Badge from "../../components/common/Badge.jsx"
import Empty from "../../components/common/Empty.jsx"
import ErrorState from "../../components/common/ErrorState.jsx"
import Loading from "../../components/common/Loading.jsx"

const SEX_LABELS = {
  M: "수컷",
  F: "암컷",
  Q: "미상",
}

const NEUTER_LABELS = {
  Y: "중성화 완료",
  N: "중성화 안 됨",
  U: "미상",
}

function formatDate(value) {
  return value ? String(value).slice(0, 10) : "정보 없음"
}

function displayValue(value) {
  return value || "정보 없음"
}

export default function LostDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [post, setPost] = useState(null)
  const [currentImageIndex, setCurrentImageIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [actionError, setActionError] = useState("")
  const [retryCount, setRetryCount] = useState(0)
  const [deleting, setDeleting] = useState(false)

  // 주소의 공고 ID가 바뀌거나 다시 시도할 때 상세정보를 새로 조회한다.
  useEffect(() => {
    let cancelled = false

    async function loadPost() {
      setLoading(true)
      setError("")

      try {
        const result = await getLostPost(id)
        if (cancelled) return
        setPost(result)
        setCurrentImageIndex(0)
      } catch (err) {
        if (!cancelled) {
          setPost(null)
          setError(err.message || "실종 공고를 불러오지 못했습니다.")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadPost()
    return () => { cancelled = true }
  }, [id, retryCount])

  const images = post?.images ?? []
  const currentImage = images[currentImageIndex]

  function handlePreviousImage() {
    if (images.length < 2) return
    setCurrentImageIndex((index) => (
      index === 0 ? images.length - 1 : index - 1
    ))
  }

  function handleNextImage() {
    if (images.length < 2) return
    setCurrentImageIndex((index) => (
      index === images.length - 1 ? 0 : index + 1
    ))
  }

  async function handleDelete() {
    const confirmed = window.confirm("이 실종 공고를 삭제하시겠습니까?")
    if (!confirmed) return

    setDeleting(true)
    setActionError("")

    try {
      await deleteLostPost(id)
      navigate("/lost-posts", { replace: true })
    } catch (err) {
      setActionError(err.message || "실종 공고를 삭제하지 못했습니다.")
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return <Loading message="실종 공고를 불러오는 중입니다." />
  }

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => setRetryCount((count) => count + 1)}
      />
    )
  }

  if (!post) {
    return <Empty message="실종 공고를 찾을 수 없습니다." />
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">실종 공고 상세</h1>
      </div>

      <section>
        <div>
          {currentImage ? (
            <img
              src={currentImage.image_url}
              alt={`${post.pet_name || post.breed || "실종 동물"} 사진 ${currentImageIndex + 1}`}
            />
          ) : (
            <Empty message="등록된 이미지가 없습니다." />
          )}

          {images.length > 0 && (
            <div className="row-between">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handlePreviousImage}
                disabled={images.length < 2}
                aria-label="이전 사진"
              >
                이전
              </button>
              <span>{currentImageIndex + 1} / {images.length}</span>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleNextImage}
                disabled={images.length < 2}
                aria-label="다음 사진"
              >
                다음
              </button>
            </div>
          )}
        </div>

        <div className="stack">
          <div className="row-between">
            <Badge type="lost">{post.status === "closed" ? "종료" : "실종"}</Badge>
            <span className="text-sub">등록일 {formatDate(post.created_at)}</span>
          </div>

          <h2>{displayValue(post.pet_name)}</h2>

          <dl>
            <div><dt>동물 종류</dt><dd>{displayValue(post.species)}</dd></div>
            <div><dt>품종</dt><dd>{displayValue(post.breed)}</dd></div>
            <div><dt>색상</dt><dd>{displayValue(post.color)}</dd></div>
            <div><dt>성별</dt><dd>{SEX_LABELS[post.sex] || "정보 없음"}</dd></div>
            <div><dt>중성화 여부</dt><dd>{NEUTER_LABELS[post.neuter_yn] || "정보 없음"}</dd></div>
            <div><dt>실종 지역</dt><dd>{displayValue(post.region)}</dd></div>
            <div><dt>실종 날짜</dt><dd>{formatDate(post.event_date)}</dd></div>
            <div><dt>특징</dt><dd>{displayValue(post.description)}</dd></div>
          </dl>

          {actionError && <p role="alert">{actionError}</p>}

          {post.is_owner ? (
            <div className="row">
              {/* TODO: LostEditPage와 수정 라우트가 만들어지면 이동 기능을 연결한다. */}
              <button type="button" className="btn btn-outline" disabled>
                공고 수정
              </button>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "삭제 중..." : "공고 삭제"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate(`/lost-posts/${id}/matches`)}
              >
                AI 매칭 요청
              </button>
            </div>
          ) : (
            <div>
              {/* TODO: ReportModal이 구현되면 모달 열기 기능을 연결한다. */}
              <button type="button" className="btn btn-outline" disabled>
                신고하기
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
