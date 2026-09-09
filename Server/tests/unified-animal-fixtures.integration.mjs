// Run from Server: node --env-file=.env tests/unified-animal-fixtures.integration.mjs
// All fixtures, migration DDL and API writes target session-local temporary tables.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { randomUUID } from "node:crypto"
import { pool } from "../src/db/pool.js"
import { createAccessToken } from "../src/utils/jwt.js"
import app from "../src/app.js"

const tables = ["users", "rescue_animals", "pawinhand_animals", "images", "bookmarks"]
// Same BIGINT in both sources deliberately tests collision and JSON precision handling.
const animalId = "9007199254740993"
const userId = "9007199254740994"
const marker = `verification-${randomUUID()}`
const urls = { rescue: `/uploads/${marker}.jpg`, pawinhand: `https://example.invalid/${marker}.jpg` }
const results = []
const client = await pool.connect()
const originalQuery = pool.query
let queue = Promise.resolve()
let server
let before
let list
const bookmarkIds = {}

// Route the unmodified repositories to the same real PostgreSQL session, without fake responses.
pool.query = (...args) => {
    const next = queue.then(() => client.query(...args))
    queue = next.catch(() => {})
    return next
}

async function check(number, name, fn) {
    try {
        await fn()
        results.push({ number, name, status: "PASS" })
    } catch (error) {
        results.push({ number, name, status: "FAIL", code: error.code ?? error.name, message: error.message })
        throw error
    }
}

async function snapshot() {
    const state = {}
    for (const table of tables) {
        // Return only aggregate digests; never log user rows or credentials.
        state[table] = (await client.query(`SELECT COUNT(*)::text AS count,
            md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY ${table === "rescue_animals" ? "desertion_no" : "id"}), '')) AS digest
            FROM public.${table} t`)).rows[0]
    }
    state.bookmarkColumns = (await client.query(`SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns WHERE table_schema='public' AND table_name='bookmarks'
        ORDER BY ordinal_position`)).rows
    return state
}

try {
    before = await snapshot()
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout = '30s'")
    for (const table of tables) {
        await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`)
        if (table !== "rescue_animals") {
            // LIKE can inherit production sequence defaults. Replace before any insert.
            await client.query(`CREATE TEMP SEQUENCE fixture_${table}_ids`)
            await client.query(`ALTER TABLE pg_temp.${table} ALTER COLUMN id SET DEFAULT nextval('pg_temp.fixture_${table}_ids')`)
        }
    }
    // Assert unqualified application queries resolve to temporary tables before invoking APIs.
    for (const table of tables) {
        assert.equal((await client.query("SELECT c.relpersistence FROM pg_class c WHERE c.oid=to_regclass($1)", [table])).rows[0].relpersistence, "t")
    }
    const migration = await readFile(new URL("../src/db/migrations/006_bookmark_sources.sql", import.meta.url), "utf8")
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""))
    // LIKE omits foreign keys. Restore the references used by these fixtures in the temp schema.
    await client.query(`ALTER TABLE pg_temp.bookmarks
        ADD FOREIGN KEY (user_id) REFERENCES pg_temp.users(id),
        ADD FOREIGN KEY (desertion_no) REFERENCES pg_temp.rescue_animals(desertion_no) ON DELETE CASCADE`)
    await client.query(`ALTER TABLE pg_temp.images
        ADD FOREIGN KEY (desertion_no) REFERENCES pg_temp.rescue_animals(desertion_no) ON DELETE CASCADE,
        ADD FOREIGN KEY (pawinhand_animal_id) REFERENCES pg_temp.pawinhand_animals(id) ON DELETE CASCADE`)
    await client.query("INSERT INTO pg_temp.users(id,name,email,provider) VALUES($1,$2,$3,'LOCAL')", [userId, marker, `${marker}@example.invalid`])
    await client.query(`INSERT INTO pg_temp.rescue_animals(desertion_no,up_kind_nm,kind_nm,happen_dt,notice_sdt,notice_edt)
        VALUES($1,'개','믹스견',CURRENT_DATE-2,CURRENT_DATE-2,CURRENT_DATE)`, [animalId])
    await client.query(`INSERT INTO pg_temp.pawinhand_animals(id,source_id,detail_url,up_kind_nm,kind_nm,happen_dt,notice_sdt,notice_edt)
        VALUES($1,$2,$3,'고양이','한국 고양이',CURRENT_DATE-1,CURRENT_DATE-1,CURRENT_DATE+1)`, [animalId, marker, `https://example.invalid/${marker}`])
    await client.query("INSERT INTO pg_temp.images(post_type,desertion_no,image_url) VALUES('rescue',$1,$2)", [animalId, urls.rescue])
    await client.query("INSERT INTO pg_temp.images(post_type,pawinhand_animal_id,image_url) VALUES('pawinhand',$1,$2)", [animalId, urls.pawinhand])

    server = app.listen(0, "127.0.0.1")
    await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject) })
    const base = `http://127.0.0.1:${server.address().port}`
    const token = createAccessToken(userId)
    async function request(path, method = "GET", body) {
        const response = await fetch(base + path, {
            method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        })
        return { status: response.status, body: await response.json() }
    }
    const sources = (items) => items.map((item) => item.source_type).sort()

    await check(1, "GET /rescue-animals returns both sources", async () => {
        const response = await request("/rescue-animals")
        assert.equal(response.status, 200)
        assert.equal(response.body.success, true)
        list = response.body.data
        assert.deepEqual(sources(list.items), ["pawinhand", "rescue"])
    })
    await check(2, "one unified items array", async () => {
        assert.ok(Array.isArray(list.items))
        assert.deepEqual(Object.keys(list).sort(), ["items", "page", "size", "total"])
    })
    await check(3, "combined total is exactly two", async () => { assert.equal(list.total, 2) })
    await check(4, "global ordering and pagination applied once", async () => {
        for (const [page, source] of [[1, "pawinhand"], [2, "rescue"], [3, null]]) {
            const response = await request(`/rescue-animals?size=1&page=${page}`)
            assert.equal(response.status, 200)
            const data = response.body.data
            assert.equal(data.total, 2)
            assert.equal(data.page, page)
            assert.equal(data.size, 1)
            assert.deepEqual(sources(data.items), source ? [source] : [])
        }
    })
    await check(5, "source IDs and source-specific images remain distinct", async () => {
        for (const item of list.items) {
            assert.equal(item.animal_id, animalId)
            assert.equal(typeof item.animal_id, "string")
            assert.equal(item.desertion_no, item.source_type === "rescue" ? animalId : null)
            assert.equal(item.source_id, item.source_type === "rescue" ? null : marker)
            assert.equal(item.image_url, urls[item.source_type])
        }
    })
    for (const [number, source] of [[6, "rescue"], [7, "pawinhand"]]) {
        await check(number, `${source} detail uses the shared detail API`, async () => {
            const response = await request(`/rescue-animals/${source}/${animalId}`)
            assert.equal(response.status, 200)
            const detail = response.body.data
            assert.equal(detail.source_type, source)
            assert.equal(detail.animal_id, animalId)
            assert.deepEqual(detail.images, [urls[source]])
            assert.equal(detail.is_bookmarked, false)
            assert.equal(detail.days_until_end, source === "rescue" ? 0 : 1)
            if (source === "rescue") {
                const legacy = await request(`/rescue-animals/${animalId}`)
                assert.equal(legacy.status, 200)
                assert.deepEqual(legacy.body, response.body)
            } else {
                assert.equal(detail.source_id, marker)
                for (const key of ["notice_no", "detail_url", "process_state", "age", "weight"]) assert.ok(key in detail)
            }
        })
    }
    for (const [number, source] of [[8, "rescue"], [9, "pawinhand"]]) {
        await check(number, `${source} registration through POST /bookmarks`, async () => {
            const response = await request("/bookmarks", "POST", { source_type: source, animal_id: animalId })
            assert.equal(response.status, 201)
            assert.equal(response.body.data.source_type, source)
            assert.equal(response.body.data.animal_id, animalId)
            bookmarkIds[source] = response.body.data.bookmark_id
            const detail = await request(`/rescue-animals/${source}/${animalId}`)
            assert.equal(detail.body.data.is_bookmarked, true)
            if (source === "rescue") {
                const other = await request(`/rescue-animals/pawinhand/${animalId}`)
                assert.equal(other.body.data.is_bookmarked, false)
            }
        })
    }
    await check(10, "duplicate bookmarks return 409 for both sources", async () => {
        for (const source of ["rescue", "pawinhand"]) {
            const response = await request("/bookmarks", "POST", { source_type: source, animal_id: animalId })
            assert.equal(response.status, 409)
            assert.equal(response.body.error.code, "BOOKMARK_ALREADY_EXISTS")
        }
        assert.notEqual(bookmarkIds.rescue, bookmarkIds.pawinhand)
    })
    await check(11, "GET /bookmarks combines both sources in one list", async () => {
        const response = await request("/bookmarks")
        assert.equal(response.status, 200)
        assert.deepEqual(Object.keys(response.body.data), ["items"])
        assert.deepEqual(sources(response.body.data.items), ["pawinhand", "rescue"])
        for (const item of response.body.data.items) {
            assert.equal(item.animal_id, animalId)
            assert.equal(item.image_url, urls[item.source_type])
            assert.equal(item.bookmark_id, bookmarkIds[item.source_type])
        }
    })
    await check(12, "GET /my/summary counts both bookmarks", async () => {
        const response = await request("/my/summary")
        assert.equal(response.status, 200)
        assert.equal(response.body.data.counts.bookmarks, 2)
    })
    await check(13, "bookmark_previews is one mixed array", async () => {
        const response = await request("/my/summary")
        const items = response.body.data.bookmark_previews
        assert.deepEqual(sources(items), ["pawinhand", "rescue"])
        for (const item of items) {
            assert.equal(item.bookmark_id, bookmarkIds[item.source_type])
            assert.equal(item.animal_id, animalId)
            assert.equal(item.thumbnail_url, urls[item.source_type])
            assert.equal(item.is_expired, false)
        }
    })
    await check(14, "both sources use DELETE /bookmarks/:bookmarkId", async () => {
        for (const source of ["rescue", "pawinhand"]) {
            const response = await request(`/bookmarks/${bookmarkIds[source]}`, "DELETE")
            assert.equal(response.status, 200)
            assert.equal((await request(`/rescue-animals/${source}/${animalId}`)).body.data.is_bookmarked, false)
            const remaining = (await request("/bookmarks")).body.data.items
            assert.deepEqual(sources(remaining), source === "rescue" ? ["pawinhand"] : [])
        }
        const summary = (await request("/my/summary")).body.data
        assert.equal(summary.counts.bookmarks, 0)
        assert.deepEqual(summary.bookmark_previews, [])
    })
    await check(16, "legacy desertion_no body is equivalent to rescue source", async () => {
        const legacy = await request("/bookmarks", "POST", { desertion_no: animalId })
        assert.equal(legacy.status, 201)
        assert.equal(legacy.body.data.source_type, "rescue")
        assert.equal(legacy.body.data.animal_id, animalId)
        assert.equal((await request("/bookmarks", "POST", { source_type: "rescue", animal_id: animalId })).status, 409)
        assert.equal((await request(`/bookmarks/${legacy.body.data.bookmark_id}`, "DELETE")).status, 200)
    })
    await check(17, "source detail route precedes legacy detail route", async () => {
        const router = await readFile(new URL("../src/modules/rescue-animals/rescue-animals.router.js", import.meta.url), "utf8")
        const current = router.indexOf('router.get("/:sourceType/:animalId"')
        const legacy = router.indexOf('router.get("/:desertionNo"')
        assert.ok(current >= 0 && current < legacy)
    })
} catch (error) {
    process.exitCode = 1
    if (!results.some((result) => result.status === "FAIL")) {
        results.push({ name: "setup", status: "FAIL", code: error.code ?? error.name, message: error.message })
    }
} finally {
    try {
        if (server) await new Promise((resolve) => server.close(resolve))
        await queue
        await client.query("ROLLBACK")
        await check(15, "rollback removes fixtures and preserves original DB rows and schema", async () => {
            assert.ok(before, "Baseline snapshot must exist")
            assert.deepEqual(await snapshot(), before)
            for (const table of tables) {
                assert.equal((await client.query("SELECT to_regclass($1)::text AS relation", [`pg_temp.${table}`])).rows[0].relation, null)
            }
            assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM public.users WHERE email=$1", [`${marker}@example.invalid`])).rows[0].n, 0)
            assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM public.pawinhand_animals WHERE source_id=$1", [marker])).rows[0].n, 0)
            assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM public.images WHERE image_url=ANY($1::text[])", [Object.values(urls)])).rows[0].n, 0)
        })
    } catch {
        process.exitCode = 1
    } finally {
        pool.query = originalQuery
        client.release()
        await pool.end()
        console.log(JSON.stringify(results.sort((a, b) => (a.number ?? 0) - (b.number ?? 0)), null, 2))
    }
}
