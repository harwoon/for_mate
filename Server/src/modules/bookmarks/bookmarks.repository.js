import { query } from "../../db/pool.js"

// 사용 테이블: bookmarks, rescue_animals


// 구조동물 존재 확인
export async function findRescueAnimalByDesertionNo(desertionNo) {
    const result = await query(
        `
            SELECT desertion_no
            FROM rescue_animals
            WHERE desertion_no = $1
        `,
        [desertionNo]
    )

    return result.rows[0]
}

// 중복 북마크 확인
export async function findByUserAndDesertionNo(userId, desertionNo) {
    const result = await query(
        `
            SELECT id
            FROM bookmarks
            WHERE user_id = $1
                AND desertion_no = $2
        `,
        [userId, desertionNo]
    )

    return result.rows[0]
}

// 7.1 북마크 등록
export async function create(userId, desertionNo) {
    const result = await query(
        `
            INSERT INTO bookmarks (
                user_id,
                desertion_no
            )
            VALUES ($1, $2)
            RETURNING id, desertion_no, created_at
        `,
        [userId, desertionNo]
    )

    return result.rows[0]
}

// 7.2 북마크 목록 조회
export async function findMany(userId) {
    const result = await query(
        `
            SELECT
                b.id AS bookmark_id,
                b.desertion_no,
                (
                    SELECT i.image_url
                    FROM images i
                    WHERE i.post_type = 'rescue'
                        AND i.desertion_no = b.desertion_no
                    ORDER BY i.created_at ASC, i.id ASC
                    LIMIT 1
                ) AS thumbnail_url,
                ra.up_kind_nm AS species,
                ra.happen_place AS region,
                CASE
                    WHEN ra.notice_edt IS NOT NULL
                        AND ra.notice_edt < CURRENT_DATE
                    THEN true
                    ELSE false
                END AS is_expired,
                b.created_at
            FROM bookmarks b
            JOIN rescue_animals ra
                ON ra.desertion_no = b.desertion_no
            WHERE b.user_id = $1
            ORDER BY b.created_at DESC, b.id DESC
        `,
        [userId]
    )

    return result.rows
}

// 북마크 소유자 확인
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