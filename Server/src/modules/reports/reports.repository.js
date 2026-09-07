import { query } from "../../db/pool.js"

// 사용 테이블: reports
export async function findDuplicate({ userId, postId, postType }) {
    const result = await query(
        `SELECT id
        FROM reports
        WHERE user_id = $1
            AND post_id = $2
            AND post_type = $3
        LIMIT 1`,
        [userId, postId, postType]
    )

    return result.rows[0] ?? null
}

export async function create({ userId, postId, postType, reason, detail }) {
    const result = await query(
        `INSERT INTO reports (
            post_id, post_type, user_id, reason, detail
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, post_id, post_type, status, created_at`,
        [postId, postType, userId, reason, detail]
    )

    return result.rows[0]
}