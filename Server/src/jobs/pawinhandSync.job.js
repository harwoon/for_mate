import "dotenv/config"
import { pool } from "../db/pool.js"
import { parseRegion } from "./regionParser.js"
import { notifyNewMatches } from "./notifyNewMatches.js"
import { setGlobalDispatcher, Agent } from "undici"

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0 }))

// 포인핸드가 공개한 최신 구조동물 RSS와 상세 JSON을 이용해 DB를 동기화한다.
// 기본값은 안전한 확인을 위해 최신 5건이며, 환경변수로 건수와 요청 간격을 조정할 수 있다.
// 실행: npm run job:pawinhand-sync
// 저장 없이 확인: PAWINHAND_DRY_RUN=true npm run job:pawinhand-sync

const RSS_URL = "https://pawinhand.kr/rss-animals.xml"
const DETAIL_API_BASE_URL = "https://pawinhand.net/bridge/animal/"
const DETAIL_PAGE_BASE_URL = "https://pawinhand.kr/shelter/animal/detail/"
const IMAGE_BASE_URL = "https://d12l2mexpetzlh.cloudfront.net/images/shelter/"

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500
const DEFAULT_REFRESH_LIMIT = 100
const SUPPORTED_SPECIES = new Set(["개", "고양이"])
const DEFAULT_REQUEST_DELAY_MS = 300
const REQUEST_TIMEOUT_MS = 10_000
const MAX_IMAGES = 8

function parsePositiveInteger(value, fallback, max) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) return fallback
  return Math.min(number, max)
}

const syncLimit = parsePositiveInteger(
  process.env.PAWINHAND_SYNC_LIMIT,
  DEFAULT_LIMIT,
  MAX_LIMIT,
)
const refreshLimit = parsePositiveInteger(
  process.env.PAWINHAND_REFRESH_LIMIT,
  DEFAULT_REFRESH_LIMIT,
  MAX_LIMIT,
)
const requestDelayMs = parsePositiveInteger(
  process.env.PAWINHAND_REQUEST_DELAY_MS,
  DEFAULT_REQUEST_DELAY_MS,
  10_000,
)
const dryRun = process.env.PAWINHAND_DRY_RUN === "true"

function serviceError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/rss+xml, application/xml, text/xml, text/plain",
      "User-Agent": "ForMate-PawinhandSync/0.1",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw serviceError(`요청 실패 (${response.status}): ${url}`, "PAWINHAND_FETCH_FAILED")
  }
  return response.text()
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "ForMate-PawinhandSync/0.1",
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw serviceError(`요청 실패 (${response.status}): ${url}`, "PAWINHAND_FETCH_FAILED")
  }

  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.includes("application/json")) {
    throw serviceError(`JSON 응답이 아닙니다: ${url}`, "INVALID_PAWINHAND_RESPONSE")
  }
  return response.json()
}

function decodeXmlText(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim()
}

// RSS의 각 item 링크 끝부분이 포인핸드 상세 조회에 사용하는 원본 공고번호다.
function parseSourceIdsFromRss(xml, limit) {
  const sourceIds = []
  const seen = new Set()
  const itemPattern = /<item>([\s\S]*?)<\/item>/g

  for (const itemMatch of xml.matchAll(itemPattern)) {
    const linkMatch = itemMatch[1].match(/<link>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/link>/)
    if (!linkMatch) continue

    const link = decodeXmlText(linkMatch[1])
    const encodedId = link.split("/").filter(Boolean).at(-1)
    if (!encodedId) continue

    let sourceId
    try {
      sourceId = decodeURIComponent(encodedId).trim()
    } catch {
      continue
    }

    if (!sourceId || seen.has(sourceId)) continue
    seen.add(sourceId)
    sourceIds.push(sourceId)
    if (sourceIds.length >= limit) break
  }

  if (sourceIds.length === 0) {
    throw serviceError("RSS에서 포인핸드 공고번호를 찾지 못했습니다.", "EMPTY_PAWINHAND_RSS")
  }
  return sourceIds
}

function optionalText(value, maxLength) {
  if (value === undefined || value === null) return null
  const text = String(value).trim()
  if (!text) return null
  return maxLength ? text.slice(0, maxLength) : text
}

function normalizeDate(value) {
  const digits = String(value ?? "").replace(/\D/g, "")
  if (digits.length !== 8) return null

  const normalized = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  const date = new Date(`${normalized}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== normalized) {
    return null
  }
  return normalized
}

function normalizeChoice(value, allowed) {
  const normalized = optionalText(value, 1)?.toUpperCase() ?? null
  return allowed.includes(normalized) ? normalized : null
}

// 기존 서비스에서 사용하는 표준 색상 태그로 단순 정규화한다.
// 한 원본 색상에서 여러 색이 발견되면 모두 보존한다.
function normalizeColorTags(value) {
  const color = optionalText(value)
  if (!color) return null

  const rules = [
    ["흰색", /(흰|백색|화이트|white)/i],
    ["검은색", /(검|흑색|블랙|black)/i],
    ["갈색", /(갈색|밤색|브라운|brown)/i],
    ["황색", /(황색|노랑|금색|골드|yellow)/i],
    ["회색", /(회색|은색|그레이|gray|grey)/i],
    ["크림색", /(크림|아이보리|cream|ivory)/i],
  ]
  const tags = rules.filter(([, pattern]) => pattern.test(color)).map(([tag]) => tag)
  return tags.length > 0 ? tags : ["기타"]
}

function toImageUrl(value) {
  const text = optionalText(value)
  if (!text) return null

  const candidate = /^https?:\/\//i.test(text)
    ? text
    : `${IMAGE_BASE_URL}${text.replace(/^\/+/, "")}`

  try {
    const url = new URL(candidate)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (/\.(?:mp4|mov|avi|wmv|webm|m4v)$/i.test(url.pathname)) return null
    if (!/\.(?:jpe?g|png|webp)$/i.test(url.pathname)) return null
    return url.toString()
  } catch {
    return null
  }
}

// video 이름의 필드는 의도적으로 읽지 않는다.
function extractImageUrls(raw) {
  const imageFields = [
    raw.image,
    raw.image2,
    raw.image3,
    raw.more_image1,
    raw.more_image2,
    raw.more_image3,
    raw.more_image4,
    raw.more_image5,
  ]

  return [...new Set(imageFields.map(toImageUrl).filter(Boolean))].slice(0, MAX_IMAGES)
}

function normalizeAnimal(raw, requestedSourceId) {
  const sourceId = optionalText(raw.notify_number ?? requestedSourceId, 100)
  const species = optionalText(raw.species, 20)
  if (!sourceId || !species) {
    throw serviceError("공고번호 또는 축종이 없는 상세 응답입니다.", "INVALID_PAWINHAND_RESPONSE")
  }

  const careAddress = optionalText(raw.shelter_address, 200)
  const parsedRegion = parseRegion(careAddress)

  return {
    sourceId,
    noticeNo: sourceId,
    detailUrl: `${DETAIL_PAGE_BASE_URL}${encodeURIComponent(sourceId)}`,
    happenDate: normalizeDate(raw.registration_date),
    happenPlace: optionalText(raw.find_location, 200),
    species,
    breed: optionalText(raw.s_breeds, 50),
    color: optionalText(raw.color, 100),
    colorTags: normalizeColorTags(raw.color),
    age: optionalText(raw.age, 30),
    weight: optionalText(raw.weight, 20),
    processState: optionalText(raw.state, 30),
    sex: normalizeChoice(raw.sex, ["M", "F", "Q"]),
    neuterYn: normalizeChoice(raw.neutral, ["Y", "N", "U"]),
    specialMark: optionalText(raw.feature),
    careName: optionalText(raw.shelter_name, 100),
    careTel: optionalText(raw.shelter_tel, 30),
    careAddress,
    regionSido: optionalText(raw.city, 30) ?? parsedRegion.sido,
    regionSigungu: optionalText(raw.country, 40) ?? parsedRegion.sigungu,
    rfidCode: optionalText(raw.registration_number, 50),
    noticeStartDate: normalizeDate(raw.notify_sdt),
    noticeEndDate: normalizeDate(raw.notify_edt),
    imageUrls: extractImageUrls(raw),
  }
}

async function fetchLatestSourceIds(limit) {
  const xml = await fetchText(RSS_URL)
  return parseSourceIdsFromRss(xml, limit)
}

// RSS에 다시 나타나지 않더라도 기존 보호 중 공고의 상태와 사진 변경을 확인한다.
// 이미 종료된 공고는 매일 재조회하지 않는다.
async function findRefreshSourceIds(limit) {
    const result = await pool.query(
    `SELECT source_id
     FROM pawinhand_animals
     WHERE up_kind_nm IN ('개', '고양이')
       AND (process_state = '보호중' OR notice_edt >= CURRENT_DATE)
     ORDER BY last_seen_at ASC, id ASC
     LIMIT $1`,
    [limit],
  )
  return result.rows.map((row) => row.source_id)
}

async function findExistingSourceIds(sourceIds) {
  if (sourceIds.length === 0) return new Set()
  const result = await pool.query(
    `SELECT source_id
     FROM pawinhand_animals
     WHERE source_id = ANY($1::text[])`,
    [sourceIds],
  )
  return new Set(result.rows.map((row) => row.source_id))
}

async function fetchAnimal(sourceId) {
  const raw = await fetchJson(`${DETAIL_API_BASE_URL}${encodeURIComponent(sourceId)}`)
  return normalizeAnimal(raw, sourceId)
}

async function syncImages(client, pawinhandAnimalId, imageUrls) {
  const currentResult = await client.query(
    `SELECT id, image_url
     FROM images
     WHERE post_type = 'pawinhand' AND pawinhand_animal_id = $1
     ORDER BY id ASC`,
    [pawinhandAnimalId],
  )

  // 상세 API가 일시적으로 빈 이미지 배열을 반환한 경우 기존 사진 전체가
  // 삭제되는 사고를 막는다. 새 이미지가 확인된 실행에서만 차이를 동기화한다.
  if (imageUrls.length === 0) return

  const incoming = new Set(imageUrls)
  const currentByUrl = new Map(currentResult.rows.map((image) => [image.image_url, image]))
  const staleIds = currentResult.rows
    .filter((image) => !incoming.has(image.image_url))
    .map((image) => image.id)

  if (staleIds.length > 0) {
    await client.query(
      `DELETE FROM images
       WHERE post_type = 'pawinhand'
         AND pawinhand_animal_id = $1
         AND id = ANY($2::bigint[])`,
      [pawinhandAnimalId, staleIds],
    )
  }

  for (const imageUrl of imageUrls) {
    if (currentByUrl.has(imageUrl)) continue
    await client.query(
      `INSERT INTO images (post_type, pawinhand_animal_id, image_url)
       VALUES ('pawinhand', $1, $2)`,
      [pawinhandAnimalId, imageUrl],
    )
  }
}

async function saveAnimal(animal) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    const existingResult = await client.query(
      `SELECT id
       FROM pawinhand_animals
       WHERE source_id = $1
       FOR UPDATE`,
      [animal.sourceId],
    )

    const result = await client.query(
      `INSERT INTO pawinhand_animals (
         source_id, notice_no, detail_url, happen_dt, happen_place,
         up_kind_nm, kind_nm, color_cd, color_tags, age, weight,
         process_state, sex_cd, neuter_yn, special_mark,
         care_nm, care_tel, care_addr, region_sido, region_sigungu,
         rfid_cd, notice_sdt, notice_edt, last_seen_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16, $17, $18, $19, $20,
         $21, $22, $23, NOW(), NOW()
       )
       ON CONFLICT (source_id) DO UPDATE SET
         notice_no = EXCLUDED.notice_no,
         detail_url = EXCLUDED.detail_url,
         happen_dt = EXCLUDED.happen_dt,
         happen_place = EXCLUDED.happen_place,
         up_kind_nm = EXCLUDED.up_kind_nm,
         kind_nm = EXCLUDED.kind_nm,
         color_cd = EXCLUDED.color_cd,
         color_tags = EXCLUDED.color_tags,
         age = EXCLUDED.age,
         weight = EXCLUDED.weight,
         process_state = EXCLUDED.process_state,
         sex_cd = EXCLUDED.sex_cd,
         neuter_yn = EXCLUDED.neuter_yn,
         special_mark = EXCLUDED.special_mark,
         care_nm = EXCLUDED.care_nm,
         care_tel = EXCLUDED.care_tel,
         care_addr = EXCLUDED.care_addr,
         region_sido = EXCLUDED.region_sido,
         region_sigungu = EXCLUDED.region_sigungu,
         rfid_cd = EXCLUDED.rfid_cd,
         notice_sdt = EXCLUDED.notice_sdt,
         notice_edt = EXCLUDED.notice_edt,
         last_seen_at = NOW(),
         updated_at = NOW()
       RETURNING id`,
      [
        animal.sourceId,
        animal.noticeNo,
        animal.detailUrl,
        animal.happenDate,
        animal.happenPlace,
        animal.species,
        animal.breed,
        animal.color,
        animal.colorTags,
        animal.age,
        animal.weight,
        animal.processState,
        animal.sex,
        animal.neuterYn,
        animal.specialMark,
        animal.careName,
        animal.careTel,
        animal.careAddress,
        animal.regionSido,
        animal.regionSigungu,
        animal.rfidCode,
        animal.noticeStartDate,
        animal.noticeEndDate,
      ],
    )

    await syncImages(client, result.rows[0].id, animal.imageUrls)
    await client.query("COMMIT")
    return existingResult.rowCount === 0 ? "inserted" : "updated"
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

// 임베딩 추출
async function extractEmbeddings() {
  // 아직 임베딩이 없는 pawinhand 사진들만 골라낸다 (syncImages가 이미 images는 다 만들어둔 상태).
  const { rows: pending } = await pool.query(
    `SELECT i.id, i.image_url, i.pawinhand_animal_id
     FROM images i
     LEFT JOIN embeddings e ON e.image_id = i.id
     WHERE i.post_type = 'pawinhand' AND e.id IS NULL`,
  )

  if (pending.length === 0) {
    console.log("[pawinhand] 임베딩 추출 대상 없음")
    return
  }

  const AI_SERVER_URL = process.env.AI_SERVER_URL ?? "http://localhost:8001"
  const CHUNK_SIZE = 30
  console.log(`[pawinhand] 임베딩 추출 요청: ${pending.length}장, ${CHUNK_SIZE}장씩 나눠서 처리`)

  for (let i = 0; i < pending.length; i += CHUNK_SIZE) {
    const chunk = pending.slice(i, i + CHUNK_SIZE)
    console.log(`  진행: ${Math.min(i + CHUNK_SIZE, pending.length)}/${pending.length}`)
    try {
      const response = await fetch(`${AI_SERVER_URL}/embeddings/images`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: chunk.map((row) => ({ id: row.id, image_url: row.image_url })),
        }),
      })
      const data = await response.json()
      const failed = data.results.filter((r) => r.status !== "ok").length
      console.log(`  완료: 성공 ${data.results.length - failed}건, 실패 ${failed}건`)
    } catch (error) {
      console.error(`  청크 처리 실패 (${i}~${i + chunk.length}):`, error.message)
    }
  }

  const animalIds = [...new Set(pending.map((row) => Number(row.pawinhand_animal_id)))]
  await notifyNewMatches("pawinhand", animalIds)
  console.log("[pawinhand] 임베딩 추출 전체 완료")
}

async function run() {
  console.log(
    `[pawinhand] 동기화 시작 (rssLimit=${syncLimit}, refreshLimit=${refreshLimit}, dryRun=${dryRun})`,
  )

  const rssSourceIds = await fetchLatestSourceIds(syncLimit)
  const refreshSourceIds = await findRefreshSourceIds(refreshLimit)
  const sourceIds = [...new Set([...rssSourceIds, ...refreshSourceIds])]
  const existingSourceIds = await findExistingSourceIds(sourceIds)
  const summary = {
    rss: rssSourceIds.length,
    requested: sourceIds.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    images: 0,
  }

  for (const [index, sourceId] of sourceIds.entries()) {
    try {
      const animal = await fetchAnimal(sourceId)

      if (!SUPPORTED_SPECIES.has(animal.species)) {
        summary.skipped += 1
        console.log(
          `[pawinhand] 지원하지 않는 축종 건너뜀 ${index + 1}/${sourceIds.length}: ${sourceId} (${animal.species})`,
        )
        continue
      }

      summary.images += animal.imageUrls.length

      if (dryRun) {
        const action = existingSourceIds.has(sourceId) ? "갱신 예정" : "신규 예정"
        console.log(
          `[pawinhand] ${action} ${index + 1}/${sourceIds.length}: ${sourceId} (images=${animal.imageUrls.length})`,
        )
      } else {
        const outcome = await saveAnimal(animal)
        summary[outcome] += 1
        const action = outcome === "inserted" ? "신규 저장" : "변경 동기화"
        console.log(
          `[pawinhand] ${action} ${index + 1}/${sourceIds.length}: ${sourceId} (images=${animal.imageUrls.length})`,
        )
      }
    } catch (error) {
      summary.failed += 1
      console.error(`[pawinhand] 실패 ${index + 1}/${sourceIds.length}: ${sourceId} - ${error.message}`)
    }

    if (index < sourceIds.length - 1) await sleep(requestDelayMs)
  }

  console.log(`[pawinhand] 동기화 완료: ${JSON.stringify(summary)}`)
  if (summary.failed === summary.requested) {
    throw serviceError("모든 포인핸드 공고 처리에 실패했습니다.", "PAWINHAND_SYNC_FAILED")
  }

  await extractEmbeddings()
  
}

run()
  .catch((error) => {
    console.error(`[pawinhand] 배치 실패: ${error.message}`)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })
