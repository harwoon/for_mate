import "dotenv/config"
import { pool } from "../db/pool.js"
import { exec } from "child_process"
import { promisify } from "util"
import { createReadStream } from "fs"
import { readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import csv from "csv-parser"
import { createClient } from "@supabase/supabase-js"
import { parseRegion } from "./regionParser.js"

const execAsync = promisify(exec)

// 새벽 배치 작업
// 실행: npm run job:sync (Cron으로 매일 새벽에 실행하도록 등록)
//
// 순서
// 1. 공공데이터 API에서 구조동물 공고를 받아온다
// 2. 품종/색상을 전처리하고 이미지 임베딩을 추출한다
// 3. rescue_animals 테이블에 upsert 한다
// 4. 기존 매칭 결과와 알림을 초기화한다
// 5. 유사도가 높은 신규 공고에 대해 알림을 새로 만든다

/*
async function fetchFromApi() {
  // TODO: 공공데이터 API 호출
  // desertionNo는 숫자로 변환해서 저장한다 (숫자가 아니면 로그 남기고 건너뛰기)
  return []
}
*/

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
)

async function preprocess() {

  // __dirname 대체 (ESM 환경)
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  // Python 파일 경로
  // const pythonFile = path.join(__dirname, "test.py") // 연습용
  const pythonFile = path.join(__dirname, "pre.py") // 실전용

  // 1. Python 파일 실행
  const { stdout, stderr } = await execAsync(`python pre.py`, { cwd: __dirname })
  if (stderr) {
    console.error(`Python stderr: ${stderr}`)
  }
  console.log(`Python stdout:\n${stdout}`)

  // 2. CSV 읽기
  const csvFile = path.join(__dirname, "abandonment_animals.csv")
  const results = await new Promise((resolve, reject)=>{
    const arr = []
    createReadStream(csvFile)
    .pipe(csv())
    .on("data", (row) => {
      arr.push(row)
    })
    .on("end", () => {
      console.log("CSV 데이터 로드 완료")
      resolve(arr)
    })
    .on("error", reject)
  })

  // 3. JSON 읽기
  const jsonFile = path.join(__dirname, "color_tags.json")
  const BOM_CHAR = String.fromCharCode(65279) // U+FEFF byte order mark
  const rawJson = (await readFile(jsonFile, "utf-8")).replace(new RegExp("^" + BOM_CHAR), "")
  const jsonData = JSON.parse(rawJson)
  console.log("JSON 데이터 로드 완료")
  // console.log('results', results.slice(0,2))
  // console.log('jsonData', jsonData.slice(0,2))
  return {results, jsonData}
}

async function saveAnimals(processed_animals) {
  // TODO: desertion_no 기준으로 upsert

  const {results, jsonData} = processed_animals
  const animals=results
  const color_tags = jsonData
  for (const [index, animal] of animals.entries()){
    const key = Object.keys(animal).find(k => k.includes("desertionNo"));
    const { sido: regionSido, sigungu: regionSigungu } = parseRegion(animal.careAddr)
    const record = {
      //컬럼매핑
      desertion_no: Number(animal[key]),
      happen_dt: animal.happenDt,
      happen_place: animal.happenPlace,
      up_kind_nm: animal.upKindNm,
      kind_nm: animal.kindNm,
      color_cd: animal.colorCd,
      color_tags: color_tags[index].split(" "),
      age: animal.age,
      weight: animal.weight,
      process_state: animal.processState,
      sex_cd:animal.sexCd,
      neuter_yn:animal.neuterYn,
      special_mark: animal.specialMark,
      care_nm: animal.careNm,
      care_tel: animal.careTel,
      care_addr: animal.careAddr,
      region_sido: regionSido,
      region_sigungu: regionSigungu,
      rfid_cd: animal.rfidCd,
      notice_sdt: animal.noticeSdt,
      notice_edt: animal.noticeEdt,
      updated_at: new Date().toISOString()
    }
    console.log(record)

    const {error} = await supabase.from("rescue_animals").upsert(record, {onConflict:"desertion_no"})

    if (error){ console.error("DB 저장 에러: ", error.message)}
  }
  console.log("DB 저장 완료")
}

async function extractEmbeddings(processed) {
  const { results } = processed
  const { rows: existing } = await pool.query(
    `SELECT DISTINCT desertion_no FROM images WHERE post_type = 'rescue'`
  )
  const alreadyProcessed = new Set(existing.map((row) => Number(row.desertion_no)))

  const animals = results
    .map((animal) => {
      const key = Object.keys(animal).find((k) => k.includes("desertionNo"))
      const desertionNo = Number(animal[key])
      const imageUrls = [animal.popfile1, animal.popfile2].filter(Boolean)
      return { desertion_no: desertionNo, image_urls: imageUrls }
    })
    .filter((animal) => !alreadyProcessed.has(animal.desertion_no) && animal.image_urls.length > 0)

  if (animals.length === 0) {
    console.log("임베딩 추출 대상 없음 (신규 동물 없음)")
    return
  }

  const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://localhost:8001"
  const CHUNK_SIZE = 30
  console.log(`임베딩 추출 요청: 신규 ${animals.length}마리, ${CHUNK_SIZE}마리씩 나눠서 처리`)

  for (let i = 0; i < animals.length; i += CHUNK_SIZE) {
    const chunk = animals.slice(i, i + CHUNK_SIZE)
    console.log(`  진행: ${Math.min(i + CHUNK_SIZE, animals.length)}/${animals.length}`)
    try {
      const response = await fetch(`${AI_SERVER_URL}/embeddings/rescue-animals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animals: chunk }),
      })
      const data = await response.json()
      const failed = data.results.filter((r) => r.status !== "ok").length
      console.log(`  완료: 성공 ${data.results.length - failed}건, 실패 ${failed}건`)
    } catch (error) {
      console.error(`  청크 처리 실패 (${i}~${i + chunk.length}):`, error.message)
      // 이 청크만 건너뛰고 다음 청크는 계속 진행
    }
  }
  console.log("임베딩 추출 전체 완료")
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

  const processed = await preprocess()
  console.log('processed', processed)
  await saveAnimals(processed)
  await extractEmbeddings(processed)
  await resetMatchesAndNotifications()
  await createNotifications()

  console.log("배치 완료")
  await pool.end()
}

run().catch((err) => {
  console.error("배치 실패:", err.message)
  process.exit(1)
})
