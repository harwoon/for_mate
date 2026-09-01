import { query } from "../../db/pool.js"

// 사용 테이블: notifications

// 9.1 알림 목록 조회
export async function findMany(userId) {
    const result = await query(
        `
            SELECT
                n.id AS notification_id,
                n.lost_post_id,
                n.desertion_no,
                ra.kind_nm AS breed,
                ra.happen_place AS region,
                n.similarity_score,
                n.is_read,
                n.created_at
            FROM notifications n
            JOIN rescue_animals ra
                ON ra.desertion_no = n.desertion_no
            WHERE n.user_id = $1
            ORDER BY n.created_at DESC, n.id DESC
        `,
        [userId]
    )

    return result.rows
}

// 알림 단건 조회
export async function findById(notificationId) {
    const result = await query(
        `
            SELECT id, user_id, is_read
            FROM notifications
            WHERE id = $1
        `,
        [notificationId]
    )

    return result.rows[0]
}

// 9.2 알림 읽음 처리
export async function markAsRead(notificationId) {
    const result = await query(
        `
            UPDATE notifications
            SET is_read = true
            WHERE id = $1
            RETURNING id, is_read
        `,
        [notificationId]
    )

    return result.rows[0]
}