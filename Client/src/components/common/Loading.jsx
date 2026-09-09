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
const COMPLETE_DELAY = 300

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
    // API가 끝나면 애니메이션을 기다리지 않고 바로 100%로 완료한다.
    useEffect(() => {
        if (!loading) {
            setTargetProgress(100)
            setDisplayProgress(100)
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

    // API가 진행 중일 때 목표 progress까지 부드럽게 이동한다.
    useEffect(() => {
        if (
            !visible ||
            complete ||
            !loading
        ) {
            return
        }

        const smoothTimer = setInterval(() => {
            setDisplayProgress((current) => {
                if (current >= targetProgress) {
                    return current
                }

                const difference =
                    targetProgress - current

                const step =
                    difference > 15
                        ? 0.9
                        : 0.5

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
        complete,
        loading
    ])

    // API가 끝나고 100%가 되면 완료 이미지를 잠깐 보여준 뒤 닫는다.
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
                        ? "완료!"
                        : message}
                </p>
            </div>
        </div>
    )
}