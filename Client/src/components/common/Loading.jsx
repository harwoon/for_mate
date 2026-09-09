import { useEffect, useState } from "react"

const RUN_FRAMES = [
    "/loading/dog-run-1.png",
    "/loading/dog-run-2.png",
    "/loading/dog-run-3.png",
    "/loading/dog-run-4.png",
    "/loading/dog-run-5.png"
]

const FINISH_FRAME = "/loading/dog-run-6.png"

const FRAME_INTERVAL = 160
const PROGRESS_INTERVAL = 180
const SMOOTH_INTERVAL = 60
const COMPLETE_DELAY = 1500

export default function Loading({
    loading = true,
    message = "불러오는 중..."
}) {
    const [visible, setVisible] = useState(true)
    const [targetProgress, setTargetProgress] = useState(0)
    const [displayProgress, setDisplayProgress] = useState(0)
    const [frameIndex, setFrameIndex] = useState(0)
    const [complete, setComplete] = useState(false)

    // 새로운 로딩이 시작되면 초기화한다.
    useEffect(() => {
        if (!loading) {
            setTargetProgress(100)
            return
        }

        setVisible(true)
        setComplete(false)
        setTargetProgress(0)
        setDisplayProgress(0)
        setFrameIndex(0)

        const progressTimer = setInterval(() => {
            setTargetProgress((current) => {
                if (current >= 92) {
                    return current
                }

                if (current < 25) {
                    return Math.min(current + 1, 92)
                }

                if (current < 60) {
                    return Math.min(current + 2, 92)
                }

                return Math.min(current + 1, 92)
            })
        }, PROGRESS_INTERVAL)

        return () => {
            clearInterval(progressTimer)
        }
    }, [loading])

    // 강아지 달리기 프레임은 progress 속도와 별개로 반복한다.
    useEffect(() => {
        if (!visible || complete) return

        const frameTimer = setInterval(() => {
            setFrameIndex((current) => (
                (current + 1) % RUN_FRAMES.length
            ))
        }, FRAME_INTERVAL)

        return () => {
            clearInterval(frameTimer)
        }
    }, [visible, complete])

    // 목표 progress까지 화면 progress를 부드럽게 따라가게 한다.
    useEffect(() => {
        if (!visible || complete) return

        const smoothTimer = setInterval(() => {
            setDisplayProgress((current) => {
                if (current >= targetProgress) {
                    return current
                }

                const difference =
                    targetProgress - current

                let step = 0.5

                // API가 끝나서 100%로 가야 할 때는
                // 너무 오래 기다리지 않도록 조금 빠르게 이동한다.
                if (targetProgress === 100) {
                    if (difference > 30) {
                        step = 2
                    } else if (difference > 10) {
                        step = 1.2
                    } else {
                        step = 0.6
                    }
                } else if (difference > 15) {
                    step = 0.9
                }

                return Math.min(
                    current + step,
                    targetProgress
                )
            })
        }, SMOOTH_INTERVAL)

        return () => {
            clearInterval(smoothTimer)
        }
    }, [
        targetProgress,
        visible,
        complete
    ])

    // 실제 API가 끝났고 화면 progress도 100%에 도착하면 완료 상태.
    useEffect(() => {
		if (
			loading ||
			displayProgress < 100
		) {
			return
		}

		setComplete(true)

		const timer = setTimeout(() => {
			setVisible(false)
		}, COMPLETE_DELAY)

		return () => {
			clearTimeout(timer)
		}
	}, [
		loading,
		displayProgress
	])

    if (!visible) return null

    const dogImage = complete
        ? FINISH_FRAME
        : RUN_FRAMES[frameIndex]

    const progressText =
        Math.round(displayProgress)

    return (
        <div
            className={`loading-screen ${
                complete ? "is-complete" : ""
            }`}
            role="status"
            aria-live="polite"
        >
            <div className="loading-content">
                <div className="loading-progress-row">
                    <div className="loading-bar-zone">
                        <img
                            src={dogImage}
                            alt=""
                            className="loading-dog"
                            style={{
                                left: `clamp(
                                    45px,
                                    ${displayProgress}%,
                                    calc(100% - 45px)
                                )`
                            }}
                        />

                        <div className="loading-progress-track">
                            <div
                                className="loading-progress-fill"
                                style={{
                                    width:
                                        `${displayProgress}%`
                                }}
                            />
                        </div>
                    </div>

                    <strong className="loading-percent">
                        {progressText}%
                    </strong>
                </div>

                <p className="loading-message">
                    {complete
                        ? "완료! 잠시 후 이동합니다."
                        : message}
                </p>
            </div>
        </div>
    )
}