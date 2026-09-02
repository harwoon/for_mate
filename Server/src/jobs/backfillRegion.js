// 새로 만든 시구/ 시군구 컬럼 채우기

import "dotenv/config"
import { pool } from "../db/pool.js"
import { parseRegion } from "./regionParser.js"

// care_addr -> region_sido/region_sigungu 1회성 백필.
// 배치(rescueAnimalSync)는 이번 수집분만 채우므로 기존 전체 행은 이걸로 채운다.
// 실행: node src/jobs/backfillRegion.js         (region_sido 비어있는 행만)
//       node src/jobs/backfillRegion.js --all   (전체 행 다시)

async function run() {
    const all = process.argv.includes("--all")

    const { rows } = await pool.query(
        all
        ? 'SELECT desertion_no, care_addr FROM rescue_animals'
        : 'SELECT desertion_no, care_addr FROM rescue_animals WHERE region_sido IS NULL'
    )
    console.log(`대상 ${rows.length}건`)
    
    const client = await pool.connect()
    let done = 0
    let parsed = 0
    try {
        await client.query("BEGIN")
        for (const {desertion_no, care_addr} of rows) {
            const {sido, sigungu} = parseRegion(care_addr)
            if (sido) parsed++
            await client.query(
                `UPDATE rescue_animals
                    SET region_sido = $1, region_sigungu = $2
                WHERE desertion_no = $3`,
                [sido, sigungu, desertion_no],
            )
            done++
            if (done % 500 === 0) console.log(` ${done}/${rows.length}`)
        }
    await client.query("COMMIT")
    } catch (err) {
        await client.query("ROLLBACK")
        throw err
    } finally {
        client.release()
    }

    console.log(`${done}건 UPDATE 완료/ ${parsed}건 시도 파싱 성공 (실패 ${done - parsed})`)
    await pool.end()
}

run().catch((err) => {
    console.error("백필 실패:", err.message)
    process.exit(1)
})





















