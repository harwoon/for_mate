import { pool } from "../../db/pool.js"

// 사용 테이블: found_posts, images
const FOUND_POST_COLUMNS = `
    id, user_id, title, species, breed, color,
    region, find_date, description, status, created_at
`

// 발견제보 등록 + 이미지 저장
export async function createPostWithImages({ userId, post, imageUrls }) {
    const client = await pool.connect()

    try {
        await client.query("BEGIN")
        const postResult = await client.query(
            `
                INSERT INTO found_posts (
                    user_id,
                    title,
                    species,
                    breed,
                    color,
                    region,
                    find_date,
                    description
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING ${FOUND_POST_COLUMNS}
            `,
            [
                userId,
                post.title,
                post.species,
                post.breed,
                post.color,
                post.region,
                post.findDate,
                post.description
            ]
        )

        const createdPost = postResult.rows[0]
        const images = []

        // 등록된 순서 = 대표 이미지 순서
        for (const imageUrl of imageUrls) {
            const imageResult = await client.query(
                `
                    INSERT INTO images (
                        post_type,
                        found_post_id,
                        image_url
                    )
                    VALUES ('found', $1, $2)
                    RETURNING id, image_url, created_at
                `,
                [createdPost.id, imageUrl]
            )

            images.push(imageResult.rows[0])
        }

        await client.query("COMMIT")

        return {
            post: createdPost,
            images
        }
    } catch (error) {
        await client.query("ROLLBACK")
        throw error

    } finally {
        client.release()
    }
}


// 발견제보 목록 조회
export async function findMany({ filters, size, offset }) {
    const conditions = []
    const params = []

    function addCondition(sql, value) {
        params.push(value)
        conditions.push(sql.replace("?", `$${params.length}`))
    }

    addCondition("fp.status = ?", filters.status)

    if (filters.species) {
        addCondition("fp.species = ?", filters.species)
    }

    if (filters.breed) {
        addCondition("fp.breed = ?", filters.breed)
    }

    // color는 복수 필터도 허용
    if (filters.colors?.length) {
        params.push(filters.colors)
        conditions.push(`fp.color = ANY($${params.length}::text[])`)
    }

    if (filters.region) {
        addCondition("fp.region ILIKE '%' || ? || '%'", filters.region)
    }

    if (filters.startDate) {
        addCondition("fp.find_date >= ?", filters.startDate)
    }

    if (filters.endDate) {
        addCondition("fp.find_date <= ?", filters.endDate)
    }

    const whereClause = conditions.length > 0
        ? `WHERE ${conditions.join(" AND ")}`
        : ""

    const countResult = await pool.query(
        `
            SELECT COUNT(*)::int AS total
            FROM found_posts fp
            ${whereClause}
        `,
        params
    )

    const listParams = [...params, size, offset]
    const sizeParam = `$${params.length + 1}`
    const offsetParam = `$${params.length + 2}`

    const listResult = await pool.query(
        `
            SELECT
                fp.id,
                fp.title,
                fp.region,
                fp.created_at
            FROM found_posts fp
            ${whereClause}
            ORDER BY fp.created_at DESC, fp.id DESC
            LIMIT ${sizeParam}
            OFFSET ${offsetParam}
        `,
        listParams
    )

    return {
        items: listResult.rows,
        total: countResult.rows[0].total
    }
}

// 발견제보 상세 조회
export async function findById(id) {
    const postResult = await pool.query(
        `
            SELECT
                fp.id,
                fp.user_id,
                fp.title,
                fp.species,
                fp.breed,
                fp.color,
                fp.region,
                fp.find_date,
                fp.description,
                fp.status,
                fp.created_at,
                u.name AS author_name
            FROM found_posts fp
            JOIN users u
                ON u.id = fp.user_id
            WHERE fp.id = $1
        `,
        [id]
    )

    const post = postResult.rows[0]

    if (!post) {
        return undefined
    }

    const imageResult = await pool.query(
        `
            SELECT
                id,
                image_url,
                created_at
            FROM images
            WHERE post_type = 'found'
                AND found_post_id = $1
            ORDER BY created_at ASC, id ASC
        `,
        [id]
    )

    return {
        ...post,
        imageRows: imageResult.rows
    }
}

// 작성자 확인
export async function findOwnerById(id) {
    const result = await pool.query(
        `
            SELECT user_id
            FROM found_posts
            WHERE id = $1
        `,
        [id]
    )

    return result.rows[0]
}

// 게시글에 등록된 이미지 조회
export async function findImagesByPostId(id) {
    const result = await pool.query(
        `
            SELECT
                id,
                image_url,
                created_at
            FROM images
            WHERE post_type = 'found'
                AND found_post_id = $1
            ORDER BY created_at ASC, id ASC
        `,
        [id]
    )

    return result.rows
}

// 발견제보 내용 + 이미지 수정
export async function updatePostWithImages({ id, fields, deleteImageUrls, newImageUrls }) {
    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        // 일반 게시글 필드 수정
        const columnMap = {
            title: "title",
            species: "species",
            breed: "breed",
            color: "color",
            region: "region",
            findDate: "find_date",
            description: "description"
        }

        const sets = []
        const params = []

        for (const [key, value] of Object.entries(fields)) {
            const column = columnMap[key]

            if (!column) continue

            params.push(value)
            sets.push(`${column} = $${params.length}`)
        }

        if (sets.length > 0) {
            params.push(id)

            await client.query(
                `
                    UPDATE found_posts
                    SET ${sets.join(", ")}
                    WHERE id = $${params.length}
                `,
                params
            )
        }

        // 기존 이미지 삭제
        const deletedImages = []

        for (const imageUrl of deleteImageUrls) {
            const result = await client.query(
                `
                    DELETE FROM images
                    WHERE post_type = 'found'
                        AND found_post_id = $1
                        AND image_url = $2
                    RETURNING id, image_url
                `,
                [id, imageUrl]
            )

            if (result.rows[0]) {
                deletedImages.push(result.rows[0])
            }
        }

        // 새 이미지 추가
        for (const imageUrl of newImageUrls) {
            await client.query(
                `
                    INSERT INTO images (
                        post_type,
                        found_post_id,
                        image_url
                    )
                    VALUES ('found', $1, $2)
                `,
                [id, imageUrl]
            )
        }

        await client.query("COMMIT")

        return {
            deletedImages
        }
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}


// 발견제보 삭제
export async function remove(id) {
    const client = await pool.connect()

    try {
        await client.query("BEGIN")

        // 실제 파일 삭제를 위해 URL 먼저 확보
        const imageResult = await client.query(
            `
                SELECT image_url
                FROM images
                WHERE post_type = 'found'
                    AND found_post_id = $1
            `,
            [id]
        )

        await client.query(
            `
                DELETE FROM images
                WHERE post_type = 'found'
                    AND found_post_id = $1
            `,
            [id]
        )

        const postResult = await client.query(
            `
                DELETE FROM found_posts
                WHERE id = $1
                RETURNING id
            `,
            [id]
        )

        await client.query("COMMIT")

        return {
            post: postResult.rows[0],
            imageUrls: imageResult.rows.map((image) => image.image_url)
        }
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}