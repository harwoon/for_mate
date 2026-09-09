import { query } from "../../db/pool.js"
import { animalsSql, animalImageCondition } from "./animal-source.js"

// 사용 테이블: rescue_animals, images

// 품종 유효성 확인
export async function existsBreed({ species, breed }) {
    const values = [breed]
    let sql = `
        SELECT 1
        FROM breeds
        WHERE name = $1
    `

    if (species) {
        values.push(species)
        sql += ` AND species = $2`
    }

    sql += ` LIMIT 1`

    const result = await query(sql, values)

    return result.rowCount > 0
}

// 5.1 구조동물 목록 조회
export async function findMany({
    species,
    breed,
    colors,
    sido,
    sigungu,
    startDate,
    endDate,
    size,
    offset
}) {
    const conditions = [
        "r.notice_edt >= CURRENT_DATE"
    ]

    const values = []

    // 종류
    if (species) {
        values.push(species)
        conditions.push(`r.up_kind_nm = $${values.length}`)
    }

    // 품종
    if (breed) {
        values.push(breed)
        conditions.push(`r.kind_nm = $${values.length}`)
    }

    // 색상 - 다중 선택 OR
    if (colors.length > 0) {
        values.push(colors)
        conditions.push(`r.color_tags && $${values.length}::text[]`)
    }

    // 지역 - care_addr에서 파싱해 저장해둔 시/도, 시/군/구(등호 비교)
    if (sido) {
        values.push(sido)
        conditions.push(`r.region_sido = $${values.length}`)
    }
    if (sigungu) {
        values.push(sigungu)
        conditions.push(`r.region_sigungu = $${values.length}`)
    }

    // 구조 발생일
    if (startDate) {
        values.push(startDate)
        conditions.push(`r.happen_dt >= $${values.length}`)
    }
    if (endDate) {
        values.push(endDate)
        conditions.push(`r.happen_dt <= $${values.length}`)
    }

    
    const whereSql = conditions.join(" AND ")

    const countResult = await query(
        `
        SELECT COUNT(*)::int AS total
        FROM (${animalsSql}) r
        WHERE ${whereSql}
        `,
        values
    )

    const listValues = [...values, size, offset]
    const sizeIndex = listValues.length - 1
    const offsetIndex = listValues.length

    const result = await query(
        `
        SELECT
            r.source_type, r.animal_id::text AS animal_id,
            r.desertion_no::text AS desertion_no, r.source_id,
            (
                SELECT i.image_url
                FROM images i
                WHERE ${animalImageCondition}
                ORDER BY i.id ASC
                LIMIT 1
            ) AS image_url,
            r.up_kind_nm AS species,
            r.kind_nm AS breed,
            r.color_tags,
            r.happen_place,
            TO_CHAR(r.happen_dt, 'YYYY-MM-DD') AS happen_dt,
            TO_CHAR(r.notice_edt, 'YYYY-MM-DD') AS notice_end_date,
            r.notice_edt - CURRENT_DATE AS days_until_end
        FROM (${animalsSql}) r
        WHERE ${whereSql}
        ORDER BY r.notice_sdt DESC NULLS LAST, r.source_type ASC, r.animal_id DESC
        LIMIT $${sizeIndex}
        OFFSET $${offsetIndex}
        `,
        listValues
    )

    return {
        items: result.rows,
        total: countResult.rows[0].total
    }
}

// 5.2 구조동물 상세 조회
export async function findById(desertionNo, userId, sourceType = "rescue") {
    const result = await query(
        `
        SELECT
            r.source_type, r.animal_id::text AS animal_id,
            r.desertion_no::text AS desertion_no, r.source_id,
            COALESCE(
                (
                    SELECT json_agg(i.image_url ORDER BY i.id ASC)
                    FROM images i
                    WHERE ${animalImageCondition}
                ),
                '[]'::json
            ) AS images,
            r.up_kind_nm AS species,
            r.kind_nm AS breed,
            r.color_cd AS color,
            r.color_tags,
            r.sex_cd AS sex,
            r.neuter_yn,
            r.special_mark,
            r.happen_place,
            TO_CHAR(r.happen_dt, 'YYYY-MM-DD') AS happen_dt,
            TO_CHAR(r.notice_sdt, 'YYYY-MM-DD') AS notice_start_date,
            TO_CHAR(r.notice_edt, 'YYYY-MM-DD') AS notice_end_date,
            r.notice_edt - CURRENT_DATE AS days_until_end,
            r.care_nm AS care_name,
            r.care_tel,
            r.care_addr, r.notice_no, r.detail_url, r.process_state, r.age, r.weight,
            EXISTS (
                SELECT 1
                FROM bookmarks b
                WHERE b.user_id = $2
                    AND b.source_type = r.source_type
                    AND ((r.source_type = 'rescue' AND b.desertion_no = r.animal_id)
                      OR (r.source_type = 'pawinhand' AND b.pawinhand_animal_id = r.animal_id))
            ) AS is_bookmarked
        FROM (${animalsSql}) r
        WHERE r.animal_id = $1 AND r.source_type = $3
        AND r.notice_edt >= CURRENT_DATE
        `,
        [desertionNo, userId, sourceType]
    )

    return result.rows[0] ?? null
}