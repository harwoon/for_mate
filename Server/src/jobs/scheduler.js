// npm run job:sync
import cron from "node-cron"
import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const serverRoot = path.join(__dirname, "..", "..")

// 매일 새벽 4시(KST)에 구조동물 동기화 배치 실행
const SYNC_CRON_EXPRESSION = "0 4 * * *"

// 매일 새벽 5시(KST)에 구조동물 동기화 배치 실행
const PAWINHAND_SYNC_CRON_EXPRESSION = "0 5 * * *"

function runSyncJob() {
  console.log("[scheduler] job:sync 시작")
  // exec는 출력을 전부 메모리에 버퍼링하다 maxBuffer(기본 1MB)를 넘기면 실패한다.
  // job:sync는 레코드마다 로그를 찍어 출력량이 크므로 spawn으로 스트리밍한다.
  const child = spawn("npm", ["run", "job:sync"], { cwd: serverRoot, shell: true })

  child.stdout.on("data", (chunk) => process.stdout.write(chunk))
  child.stderr.on("data", (chunk) => process.stderr.write(chunk))

  child.on("error", (error) => {
    console.error(`[scheduler] job:sync 실행 실패: ${error.message}`)
  })

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`[scheduler] job:sync 실패 (exit code ${code})`)
      return
    }
    console.log("[scheduler] job:sync 완료")
  })
}

function runPawinhandSyncJob() {
  console.log("[scheduler] job:pawinhand-sync 시작")
  const child = spawn("npm", ["run", "job:pawinhand-sync"], { cwd: serverRoot, shell: true })

  child.stdout.on("data", (chunk) => process.stdout.write(chunk))
  child.stderr.on("data", (chunk) => process.stderr.write(chunk))

  child.on("error", (error) => {
    console.error(`[scheduler] job:pawinhand-sync 실행 실패: ${error.message}`)
  })

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`[scheduler] job:pawinhand-sync 실패 (exit code ${code})`)
      return
    }
    console.log("[scheduler] job:pawinhand-sync 완료")
  })
}

export function startScheduler() {
  cron.schedule(SYNC_CRON_EXPRESSION, runSyncJob, { timezone: "Asia/Seoul" })
  cron.schedule(PAWINHAND_SYNC_CRON_EXPRESSION, runPawinhandSyncJob, { timezone: "Asia/Seoul" })
  console.log(`[scheduler] 등록 완료: 매일 새벽 4시(KST)에 job:sync 실행`)
  console.log(`[scheduler] 등록 완료: 매일 새벽 5시(KST)에 job:pawinhand-sync 실행`)
}
