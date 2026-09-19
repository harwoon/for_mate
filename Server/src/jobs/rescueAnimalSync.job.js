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
import { notifyNewMatches } from "./notifyNewMatches.js"
import { setGlobalDispatcher, Agent } from "undici"
import { downloadAndUploadExternalImage } from "../utils/externalImage.js"
import { deleteFromR2, extractR2Key } from "../utils/r2.js"
import { markDuplicatePawinhandAnimals } from "./markDuplicateAnimals.js"

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }))

const execAsync = promisify(exec)

function applySyncLimit(processed) {
  const rawLimit = process.env.RESCUE_SYNC_LIMIT
  if (!rawLimit) return processed

  const limit = Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error("RESCUE_SYNC_LIMIT는 1 이상의 정수여야 합니다.")
  }

  console.log(`구조동물 테스트 범위: ${limit}건`)
  return {
    results: processed.results.slice(0, limit),
    jsonData: processed.jsonData.slice(0, limit),
  }
}

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

    const {error} = await supabase.from("rescue_animals").upsert(record, {onConflict:"desertion_no"})

    if (error){ console.error("DB 저장 에러: ", error.message)}
  }
  console.log("DB 저장 완료")
}

async function syncRescueImages(processed) {
  const { results } = processed
  const animals = results
    .map((animal) => {
      const key = Object.keys(animal).find((k) => k.includes("desertionNo"))
      const desertionNo = Number(animal[key])
      const imageUrls = [...new Set([animal.popfile1, animal.popfile2].filter(Boolean))]
      return { desertion_no: desertionNo, image_urls: imageUrls, species: animal.upKindNm }
    })
    .filter(
      (animal) =>
        Number.isSafeInteger(animal.desertion_no) &&
        ["개", "고양이"].includes(animal.species) &&
        animal.image_urls.length > 0,
    )

  for (const animal of animals) {
    const client = await pool.connect()
    const uploadedKeys = []
    let staleKeys = []

    try {
      await client.query("BEGIN")
      const { rows: currentImages } = await client.query(
        `SELECT id, source_url, image_url
         FROM images
         WHERE post_type = 'rescue' AND desertion_no = $1
         ORDER BY id ASC
         FOR UPDATE`,
        [animal.desertion_no],
      )

      const incoming = new Set(animal.image_urls)
      const currentBySource = new Map(
        currentImages.map((image) => [image.source_url ?? image.image_url, image]),
      )
      const staleImages = currentImages.filter(
        (image) => !incoming.has(image.source_url ?? image.image_url),
      )
      staleKeys = staleImages
        .map((image) => extractR2Key(image.image_url))
        .filter(Boolean)

      if (staleImages.length > 0) {
        await client.query(
          `DELETE FROM images
           WHERE post_type = 'rescue'
             AND desertion_no = $1
             AND id = ANY($2::bigint[])`,
          [animal.desertion_no, staleImages.map((image) => image.id)],
        )
      }

      for (const sourceUrl of animal.image_urls) {
        const current = currentBySource.get(sourceUrl)
        if (current?.source_url && extractR2Key(current.image_url)) continue

        const uploaded = await downloadAndUploadExternalImage(sourceUrl, "rescue-animals")
        uploadedKeys.push(uploaded.key)

        if (current) {
          await client.query(
            `UPDATE images SET source_url = $1, image_url = $2 WHERE id = $3`,
            [sourceUrl, uploaded.url, current.id],
          )
        } else {
          await client.query(
            `INSERT INTO images (post_type, desertion_no, source_url, image_url)
             VALUES ('rescue', $1, $2, $3)`,
            [animal.desertion_no, sourceUrl, uploaded.url],
          )
        }
      }

      await client.query("COMMIT")
      await Promise.allSettled(staleKeys.map((key) => deleteFromR2(key)))
    } catch (error) {
      await client.query("ROLLBACK")
      await Promise.allSettled(uploadedKeys.map((key) => deleteFromR2(key)))
      console.error(`구조동물 이미지 저장 실패 (${animal.desertion_no}):`, error.message)
    } finally {
      client.release()
    }
  }
}

async function extractEmbeddings(processed) {
  await syncRescueImages(processed)

  const { rows: pending } = await pool.query(
    `SELECT i.id, i.image_url, i.desertion_no, ra.up_kind_nm AS species
     FROM images i
     JOIN rescue_animals ra ON ra.desertion_no = i.desertion_no
     LEFT JOIN embeddings e ON e.image_id = i.id
     WHERE i.post_type = 'rescue'
       AND e.id IS NULL
     ORDER BY i.id ASC`,
  )

  if (pending.length === 0) {
    console.log("임베딩 추출 대상 없음")

    await markDuplicatePawinhandAnimals()
    
    return
  }

  const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://localhost:8001"
  const CHUNK_SIZE = 30
  const processedDesertionNos = new Set()
  console.log(`임베딩 추출 요청: ${pending.length}장, ${CHUNK_SIZE}장씩 나눠서 처리`)

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    console.log(`  진행: ${Math.min(i + CHUNK_SIZE, pending.length)}/${pending.length}`)
    try {
      const response = await fetch(`${AI_SERVER_URL}/embeddings/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: chunk.map((image) => ({
            id: image.id,
            image_url: image.image_url,
            species: image.species,
          })),
        }),
      })
      if (!response.ok) throw new Error(`AI 서버 응답 오류 (${response.status})`)
      const data = await response.json()
      data.results.forEach((result, index) => {
        if (result.status === "ok") {
          processedDesertionNos.add(Number(chunk[index].desertion_no))
        }
      })

      const ok = data.results.filter((r) => r.status === "ok").length
      const duplicateSkipped = data.results.filter((r) => r.status === "duplicate_skipped").length
      const failed = data.results.length - ok - duplicateSkipped
      console.log(`  완료: 성공 ${ok}건, 중복스킵 ${duplicateSkipped}건, 실패 ${failed}건`)
    } catch (error) {
      console.error(`  청크 처리 실패 (${i}~${i + chunk.length}):`, error.message)
      // 이 청크만 건너뛰고 다음 청크는 계속 진행
    }
  }

  await markDuplicatePawinhandAnimals()

  await notifyNewMatches(
    "rescue", [...processedDesertionNos]
  )

  console.log("임베딩 추출 전체 완료")
}

async function run() {
  console.log("배치 시작")

  const processed = applySyncLimit(await preprocess())
  await saveAnimals(processed)
  await extractEmbeddings(processed)

  console.log("배치 완료")
  await pool.end()
}

run().catch((err) => {
  console.error("배치 실패:", err.message)
  process.exit(1)
})
