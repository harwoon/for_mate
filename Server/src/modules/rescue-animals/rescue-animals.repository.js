import { query } from "../../db/pool.js"

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

    // 지역 필터링 현규님 부탁드힙니다~!!

    
    const whereSql = conditions.join(" AND ")

    const countResult = await query(
        `
        SELECT COUNT(*)::int AS total
        FROM rescue_animals r
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
            r.desertion_no,
            (
                SELECT i.image_url
                FROM images i
                WHERE i.post_type = 'rescue'
                    AND i.desertion_no = r.desertion_no
                ORDER BY i.id ASC
                LIMIT 1
            ) AS image_url,
            r.up_kind_nm AS species,
            r.kind_nm AS breed,
            r.color_tags,
            r.happen_place,
            r.happen_dt,
            r.notice_edt AS notice_end_date,
            r.notice_edt - CURRENT_DATE AS days_until_end
        FROM rescue_animals r
        WHERE ${whereSql}
        ORDER BY r.notice_sdt DESC NULLS LAST, r.desertion_no DESC
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
export async function findById(desertionNo, userId) {
    const result = await query(
        `
        SELECT
            r.desertion_no,
            COALESCE(
                (
                    SELECT json_agg(i.image_url ORDER BY i.id ASC)
                    FROM images i
                    WHERE i.post_type = 'rescue'
                        AND i.desertion_no = r.desertion_no
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
            r.happen_dt,
            r.notice_sdt AS notice_start_date,
            r.notice_edt AS notice_end_date,
            r.notice_edt - CURRENT_DATE AS days_until_end,
            r.care_nm AS care_name,
            r.care_tel,
            r.care_addr,
            EXISTS (
                SELECT 1
                FROM bookmarks b
                WHERE b.user_id = $2
                    AND b.desertion_no = r.desertion_no
            ) AS is_bookmarked
        FROM rescue_animals r
        WHERE r.desertion_no = $1
        AND r.notice_edt >= CURRENT_DATE
        `,
        [desertionNo, userId]
    )

    return result.rows[0] ?? null
}