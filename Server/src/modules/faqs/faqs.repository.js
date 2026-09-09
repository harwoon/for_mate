import { query } from "../../db/pool.js"

export async function findPublished() {
    const result = await query(`
        SELECT id::text, question, answer, display_order FROM faqs
        WHERE status = 'published' ORDER BY display_order ASC, id ASC
    `)
    return result.rows
}
