import { query } from "../../db/pool.js"
import { animalsSql, animalImageCondition } from "../rescue-animals/animal-source.js"

export async function findTarget(targetId, sourceType) {
    if (sourceType === "found") {
        const result = await query(
            "SELECT id FROM found_posts WHERE id = $1 AND status <> 'blind'",
            [targetId]
        )
        return result.rows[0]
    }

    const result = await query(`SELECT animal_id FROM (${animalsSql}) r
        WHERE r.source_type = $1 AND r.animal_id = $2`, [sourceType, targetId])
    return result.rows[0]
}

export async function create(userId, targetId, sourceType) {
    const result = await query(`
        INSERT INTO bookmarks (
            user_id, source_type, desertion_no, pawinhand_animal_id, found_post_id
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT DO NOTHING
        RETURNING id::text, source_type, desertion_no::text,
            found_post_id::text,
            COALESCE(desertion_no, pawinhand_animal_id, found_post_id)::text AS animal_id,
            created_at
    `, [
        userId,
        sourceType,
        sourceType === "rescue" ? targetId : null,
        sourceType === "pawinhand" ? targetId : null,
        sourceType === "found" ? targetId : null
    ])
    return result.rows[0]
}

// Shared by the full list and the limited my-page preview.
export async function findMany(userId, limit = null) {
    const result = await query(`
        SELECT *
        FROM (
            SELECT b.id::text AS bookmark_id, b.source_type,
                r.animal_id::text AS animal_id, b.desertion_no::text,
                NULL::text AS found_post_id, r.source_id,
                NULL::text AS title,
                first_image.image_url, first_image.image_url AS thumbnail_url,
                r.up_kind_nm AS species, r.kind_nm AS breed,
                r.happen_place, r.happen_place AS region,
                NULL::text AS find_date,
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
            WHERE b.user_id = $1 AND b.source_type IN ('rescue', 'pawinhand')

            UNION ALL

            SELECT b.id::text, b.source_type,
                fp.id::text, NULL::text, fp.id::text, NULL::text,
                fp.title,
                first_image.image_url, first_image.image_url,
                fp.species, fp.breed,
                fp.region, fp.region,
                TO_CHAR(fp.find_date, 'YYYY-MM-DD'),
                NULL::text, false,
                b.created_at
            FROM bookmarks b
            JOIN found_posts fp ON fp.id = b.found_post_id
            LEFT JOIN LATERAL (
                SELECT i.image_url
                FROM images i
                WHERE i.post_type = 'found' AND i.found_post_id = fp.id
                ORDER BY i.created_at ASC, i.id ASC LIMIT 1
            ) first_image ON TRUE
            WHERE b.user_id = $1 AND b.source_type = 'found'
              AND fp.status <> 'blind'
        ) bookmark_items
        ORDER BY created_at DESC, bookmark_id::bigint DESC
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
