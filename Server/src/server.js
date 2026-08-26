import "dotenv/config"
import app from "./app.js"
import { pool } from "./db/pool.js"

const PORT = process.env.PORT || 4000

async function start() {
  // DB 연결 확인
  await pool.query("SELECT 1")
  console.log("DB 연결 완료")

  app.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`)
  })
}

start().catch((err) => {
  console.error("서버 시작 실패:", err.message)
  process.exit(1)
})
