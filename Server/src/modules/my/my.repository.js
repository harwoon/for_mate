import { query } from "../../db/pool.js"

// 사용 테이블: lost_posts, found_posts, matches, bookmarks, rescue_animals, images

// 8.1 마이페이지 요약 조회
export async function findSummary(userId) {
    const [countsResult, recentLostResult, recentFoundResult, matchResult, bookmarkResult] =
        await Promise.all([
            query(
                `SELECT
                    (SELECT COUNT(*)::int FROM lost_posts WHERE user_id = $1) AS lost_posts,
                    (SELECT COUNT(*)::int FROM found_posts WHERE user_id = $1) AS found_posts,
                    (
                        SELECT COUNT(*)::int
                        FROM matches m
                        JOIN lost_posts lp ON lp.id = m.source_post_id
                        WHERE lp.user_id = $1
                            AND m.matched_date = (
                                SELECT MAX(latest.matched_date)
                                FROM matches latest
                                WHERE latest.source_post_id = m.source_post_id
                            )
                    ) AS matches,
                    (SELECT COUNT(*)::int FROM bookmarks WHERE user_id = $1) AS bookmarks`,
                [userId]
            ),
            query(
                `SELECT
                    lp.id, lp.pet_name, lp.species, lp.breed, lp.region,
                    TO_CHAR(lp.event_date, 'YYYY-MM-DD') AS event_date,
                    lp.status, lp.created_at,
                    first_image.image_url AS primary_image_url,
                    (
                        SELECT COUNT(*)::int
                        FROM matches m
                        WHERE m.source_post_id = lp.id
                        AND m.matched_date = (
                            SELECT MAX(latest.matched_date)
                            FROM matches latest
                            WHERE latest.source_post_id = lp.id
                        )
                    ) AS match_count
                    FROM lost_posts lp
                        LEFT JOIN LATERAL (
                        SELECT image_url
                        FROM images
                        WHERE post_type = 'lost' AND lost_post_id = lp.id
                        ORDER BY created_at ASC, id ASC
                        LIMIT 1
                    ) first_image ON TRUE
                    WHERE lp.user_id = $1
                    ORDER BY lp.created_at DESC, lp.id DESC
                    LIMIT 1`,
                [userId]
            ),
            query(
                `SELECT
                    fp.id, fp.title, fp.species, fp.breed, fp.region,
                    TO_CHAR(fp.find_date, 'YYYY-MM-DD') AS find_date,
                    fp.status, fp.created_at,
                    first_image.image_url AS primary_image_url
                FROM found_posts fp
                LEFT JOIN LATERAL (
                    SELECT image_url
                    FROM images
                    WHERE post_type = 'found' AND found_post_id = fp.id
                    ORDER BY created_at ASC, id ASC
                    LIMIT 1
                ) first_image ON TRUE
                WHERE fp.user_id = $1
                ORDER BY fp.created_at DESC, fp.id DESC
                LIMIT 1`,
                [userId]
            ),
            query(
                `SELECT
                    m.id AS match_id,
                    m.source_post_id AS lost_post_id,
                    m.desertion_no,
                    first_image.image_url AS thumbnail_url,
                    m.similarity_score
                FROM matches m
                JOIN lost_posts lp ON lp.id = m.source_post_id
                LEFT JOIN LATERAL (
                    SELECT image_url
                    FROM images
                    WHERE post_type = 'rescue' AND desertion_no = m.desertion_no
                    ORDER BY created_at ASC, id ASC
                    LIMIT 1
                ) first_image ON TRUE
                WHERE lp.user_id = $1
                    AND m.matched_date = (
                        SELECT MAX(latest.matched_date)
                        FROM matches latest
                        WHERE latest.source_post_id = m.source_post_id
                    )
                ORDER BY m.similarity_score DESC, m.created_at DESC, m.id DESC
                LIMIT 6`,
                [userId]
            ),
            query(
                `SELECT
                    b.id AS bookmark_id,
                    b.desertion_no,
                    first_image.image_url AS thumbnail_url,
                    CASE
                        WHEN ra.notice_edt IS NOT NULL AND ra.notice_edt < CURRENT_DATE THEN true
                        ELSE false
                    END AS is_expired
                FROM bookmarks b
                JOIN rescue_animals ra ON ra.desertion_no = b.desertion_no
                LEFT JOIN LATERAL (
                    SELECT image_url
                    FROM images
                    WHERE post_type = 'rescue' AND desertion_no = b.desertion_no
                    ORDER BY created_at ASC, id ASC
                    LIMIT 1
                ) first_image ON TRUE
                WHERE b.user_id = $1
                ORDER BY b.created_at DESC, b.id DESC
                LIMIT 3`,
                [userId]
            )
        ])

    return {
        counts: countsResult.rows[0],
        recentLostPost: recentLostResult.rows[0] ?? null,
        recentFoundPost: recentFoundResult.rows[0] ?? null,
        matchPreviews: matchResult.rows,
        bookmarkPreviews: bookmarkResult.rows
    }
}

// 8.2 내 실종 공고 목록 조회
export async function findMyLostPosts({ userId, status, size, offset }) {
    const params = [userId]
    let statusCondition = ""

    if (status) {
        params.push(status)
        statusCondition = `AND lp.status = $${params.length}`
    }

    const countResult = await query(
        `SELECT COUNT(*)::int AS total
        FROM lost_posts lp
        WHERE lp.user_id = $1
            ${statusCondition}`,
        params
    )

    const listParams = [...params, size, offset]
    const sizeParam = `$${params.length + 1}`
    const offsetParam = `$${params.length + 2}`
    const listResult = await query(
        `SELECT
            lp.id, lp.pet_name, lp.species, lp.breed, lp.region,
            TO_CHAR(lp.event_date, 'YYYY-MM-DD') AS event_date,
            lp.status, lp.created_at,
            first_image.image_url AS primary_image_url,
            (
                SELECT COUNT(*)::int
                FROM matches m
                WHERE m.source_post_id = lp.id
                AND m.matched_date = (
                    SELECT MAX(latest.matched_date)
                    FROM matches latest
                    WHERE latest.source_post_id = lp.id
                )
            ) AS match_count
        FROM lost_posts lp
        LEFT JOIN LATERAL (
            SELECT image_url
            FROM images
            WHERE post_type = 'lost' AND lost_post_id = lp.id
            ORDER BY created_at ASC, id ASC
            LIMIT 1
        ) first_image ON TRUE
        WHERE lp.user_id = $1
        ${statusCondition}
        ORDER BY lp.created_at DESC, lp.id DESC
        LIMIT ${sizeParam} OFFSET ${offsetParam}`,
        listParams
    )

    return {
        items: listResult.rows,
        total: countResult.rows[0].total
    }
}

// 8.3 내 발견제보 목록 조회
export async function findMyFoundPosts({ userId, status, size, offset }) {
    const params = [userId]
    let statusCondition = ""

    if (status) {
        params.push(status)
        statusCondition = `AND fp.status = $${params.length}`
    }

    const countResult = await query(
        `SELECT COUNT(*)::int AS total
        FROM found_posts fp
        WHERE fp.user_id = $1
            ${statusCondition}`,
        params
    )

    const listParams = [...params, size, offset]
    const sizeParam = `$${params.length + 1}`
    const offsetParam = `$${params.length + 2}`
    const listResult = await query(
        `SELECT
            fp.id, fp.title, fp.species, fp.breed, fp.region,
            TO_CHAR(fp.find_date, 'YYYY-MM-DD') AS find_date,
            fp.status, fp.created_at,
            first_image.image_url AS primary_image_url
        FROM found_posts fp
        LEFT JOIN LATERAL (
            SELECT image_url
            FROM images
            WHERE post_type = 'found' AND found_post_id = fp.id
            ORDER BY created_at ASC, id ASC
            LIMIT 1
        ) first_image ON TRUE
        WHERE fp.user_id = $1
            ${statusCondition}
        ORDER BY fp.created_at DESC, fp.id DESC
        LIMIT ${sizeParam} OFFSET ${offsetParam}`,
        listParams
    )

    return {
        items: listResult.rows,
        total: countResult.rows[0].total
    }
}
