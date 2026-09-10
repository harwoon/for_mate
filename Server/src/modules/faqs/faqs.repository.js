import { pool, query } from "../../db/pool.js"

const FAQ_COLUMNS = `id, question, answer, display_order, status,
    created_by, updated_by, created_at, updated_at`

export async function findPublished() {
    const result = await query(`
        SELECT id::text, question, answer, display_order FROM faqs
        WHERE status = 'published' ORDER BY display_order ASC, id ASC
    `)
    return result.rows
}

export async function findAll() {
    const result = await query(
        `SELECT ${FAQ_COLUMNS}
        FROM faqs
        ORDER BY display_order ASC, id ASC`
    )
    return result.rows
}

export async function create(values, adminUserId) {
    const result = await query(
        `INSERT INTO faqs (
            question, answer, status, display_order, created_by, updated_by
        )
        VALUES (
            $1, $2, $3,
            (SELECT COALESCE(MAX(display_order), 0) + 1 FROM faqs),
            $4, $4
        )
        RETURNING ${FAQ_COLUMNS}`,
        [values.question, values.answer, values.status, adminUserId]
    )
    return result.rows[0]
}

export async function update(faqId, values, adminUserId) {
    const result = await query(
        `UPDATE faqs
        SET question = $1, answer = $2, status = $3,
            updated_by = $4, updated_at = NOW()
        WHERE id = $5
        RETURNING ${FAQ_COLUMNS}`,
        [values.question, values.answer, values.status, adminUserId, faqId]
    )
    return result.rows[0] ?? null
}

export async function updateStatus(faqId, status, adminUserId) {
    const result = await query(
        `UPDATE faqs
        SET status = $1, updated_by = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING ${FAQ_COLUMNS}`,
        [status, adminUserId, faqId]
    )
    return result.rows[0] ?? null
}

export async function updateOrder(items, adminUserId) {
    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        const current = await client.query("SELECT id FROM faqs FOR UPDATE")
        const currentIds = new Set(current.rows.map((row) => Number(row.id)))

        if (currentIds.size !== items.length || items.some((item) => !currentIds.has(item.id))) {
            const error = new Error("FAQ_ORDER_MISMATCH")
            error.code = "FAQ_ORDER_MISMATCH"
            throw error
        }

        for (const item of items) {
            await client.query(
                `UPDATE faqs
                SET display_order = $1, updated_by = $2, updated_at = NOW()
                WHERE id = $3`,
                [item.display_order, adminUserId, item.id]
            )
        }

        const result = await client.query(
            `SELECT ${FAQ_COLUMNS} FROM faqs ORDER BY display_order ASC, id ASC`
        )
        await client.query("COMMIT")
        return result.rows
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}

export async function remove(faqId) {
    const client = await pool.connect()
    try {
        await client.query("BEGIN")
        const deleted = await client.query(
            "DELETE FROM faqs WHERE id = $1 RETURNING id",
            [faqId]
        )

        if (deleted.rows[0]) {
            await client.query(
                `WITH ordered AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY display_order ASC, id ASC) AS new_order
                    FROM faqs
                )
                UPDATE faqs
                SET display_order = ordered.new_order
                FROM ordered
                WHERE faqs.id = ordered.id`
            )
        }

        await client.query("COMMIT")
        return deleted.rows[0] ?? null
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    } finally {
        client.release()
    }
}
