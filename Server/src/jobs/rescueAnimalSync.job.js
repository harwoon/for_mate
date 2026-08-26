import "dotenv/config"
import { pool } from "../db/pool.js"

// 새벽 배치 작업
// 실행: npm run job:sync (Cron으로 매일 새벽에 실행하도록 등록)
//
// 순서
// 1. 공공데이터 API에서 구조동물 공고를 받아온다
// 2. 품종/색상을 전처리하고 이미지 임베딩을 추출한다
// 3. rescue_animals 테이블에 upsert 한다
// 4. 기존 매칭 결과와 알림을 초기화한다
// 5. 유사도가 높은 신규 공고에 대해 알림을 새로 만든다

async function fetchFromApi() {
  // TODO: 공공데이터 API 호출
  // desertionNo는 숫자로 변환해서 저장한다 (숫자가 아니면 로그 남기고 건너뛰기)
  return []
}

async function preprocess(animals) {
  // TODO: 품종명 정리, 원본 색상(color_cd)을 LLM으로 표준 색상 태그(color_tags)로 변환
  return animals
}

async function saveAnimals(animals) {
  // TODO: desertion_no 기준으로 upsert
}

async function extractEmbeddings() {
  // TODO: 새로 추가된 이미지를 ML 서버에 보내 임베딩 추출 요청
}

async function resetMatchesAndNotifications() {
  // TODO: matches, notifications 초기화
  // 단, match_exclusions(사용자가 제외한 후보)는 지우지 않는다
}

async function createNotifications() {
  // TODO: 실종 공고별로 유사도를 계산해서 임계값 이상이면 알림 생성
}

async function run() {
  console.log("배치 시작")

  const animals = await fetchFromApi()
  const processed = await preprocess(animals)
  await saveAnimals(processed)
  await extractEmbeddings()
  await resetMatchesAndNotifications()
  await createNotifications()

  console.log("배치 완료")
  await pool.end()
}

run().catch((err) => {
  console.error("배치 실패:", err.message)
  process.exit(1)
})
