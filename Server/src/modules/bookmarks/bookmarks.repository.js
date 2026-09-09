import { query } from "../../db/pool.js"
import { animalsSql, animalImageCondition } from "../rescue-animals/animal-source.js"

export async function findAnimal(animalId, sourceType) {
    const result = await query(`SELECT animal_id FROM (${animalsSql}) r
        WHERE r.source_type = $1 AND r.animal_id = $2`, [sourceType, animalId])
    return result.rows[0]
}

export async function create(userId, animalId, sourceType) {
    const result = await query(`
        INSERT INTO bookmarks (user_id, source_type, desertion_no, pawinhand_animal_id)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        RETURNING id::text, source_type, desertion_no::text,
            COALESCE(desertion_no, pawinhand_animal_id)::text AS animal_id, created_at
    `, [userId, sourceType, sourceType === "rescue" ? animalId : null,
        sourceType === "pawinhand" ? animalId : null])
    return result.rows[0]
}

// Shared by the full list and the limited my-page preview.
export async function findMany(userId, limit = null) {
    const result = await query(`
        SELECT b.id::text AS bookmark_id, b.source_type,
            r.animal_id::text AS animal_id, b.desertion_no::text, r.source_id,
            first_image.image_url, first_image.image_url AS thumbnail_url,
            r.up_kind_nm AS species, r.kind_nm AS breed,
            r.happen_place, r.happen_place AS region,
            TO_CHAR(r.notice_edt, 'YYYY-MM-DD') AS notice_end_date,
            COALESCE(r.notice_edt < CURRENT_DATE, false) AS is_expired,
            b.created_at
        FROM bookmarks b
        JOIN (${animalsSql}) r ON r.source_type = b.source_type
            AND r.animal_id = COALESCE(b.desertion_no, b.pawinhand_animal_id)
        LEFT JOIN LATERAL (
            SELECT i.image_url FROM images i WHERE ${animalImageCondition}
            ORDER BY i.created_at ASC, i.id ASC LIMIT 1
        ) first_image ON TRUE
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC, b.id DESC
        LIMIT $2
    `, [userId, limit])
    return result.rows
}

export async function findById(bookmarkId) {
    const result = await query(
        `
            SELECT id, user_id
            FROM bookmarks
            WHERE id = $1
        `,
        [bookmarkId]
    )

    return result.rows[0]
}

// 7.3 북마크 삭제
export async function remove(bookmarkId) {
    const result = await query(
        `
            DELETE FROM bookmarks
            WHERE id = $1
            RETURNING id
        `,
        [bookmarkId]
    )

    return result.rows[0]
}