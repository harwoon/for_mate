// Uses actual database rows in session-local copies. No production writes or synthetic seed data.
// Run from Server: node --env-file=.env tests/frontend-readiness.integration.mjs
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pool } from "../src/db/pool.js"
import * as animals from "../src/modules/rescue-animals/rescue-animals.service.js"
import { animalsSql } from "../src/modules/rescue-animals/animal-source.js"
import * as bookmarks from "../src/modules/bookmarks/bookmarks.service.js"
import { getSummary } from "../src/modules/my/my.service.js"
import { getFaqs } from "../src/modules/faqs/faqs.service.js"
import { getPosts } from "../src/modules/found-posts/found-posts.service.js"
import { toPublicUser, signup, login } from "../src/modules/auth/auth.service.js"
import { createAccessToken } from "../src/utils/jwt.js"
import app from "../src/app.js"

const client = await pool.connect()
const originalQuery = pool.query
let pendingQuery = Promise.resolve()
pool.query = (...args) => {
    const next = pendingQuery.then(() => client.query(...args))
    pendingQuery = next.catch(() => {})
    return next
}
let server
const results = []
async function check(name, fn) {
    await client.query("SAVEPOINT verification")
    try {
        const reason = await fn()
        results.push({ name, status: reason ? "SKIP" : "PASS", ...(reason ? { reason } : {}) })
    } catch (error) {
        results.push({ name, status: "FAIL", code: error.code ?? error.name, message: error.message })
    } finally {
        await client.query("ROLLBACK TO SAVEPOINT verification")
        await client.query("RELEASE SAVEPOINT verification")
    }
}
try {
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout = '30s'")
    for (const table of ["rescue_animals", "pawinhand_animals", "images", "bookmarks", "faqs"]) {
        await client.query(`CREATE TEMP TABLE ${table} (LIKE public.${table} INCLUDING ALL) ON COMMIT DROP`)
        await client.query(`INSERT INTO pg_temp.${table} OVERRIDING SYSTEM VALUE SELECT * FROM public.${table}`)
    }
    const originalBookmarks = (await client.query("SELECT id::text, user_id::text, desertion_no::text, created_at FROM bookmarks ORDER BY id")).rows
    const migration = await readFile(new URL("../src/db/migrations/006_bookmark_sources.sql", import.meta.url), "utf8")
    await client.query(migration.replace(/^BEGIN;\s*$/m, "").replace(/^COMMIT;\s*$/m, ""))
    // Never consume a production sequence while testing inserts.
    await client.query("CREATE TEMP SEQUENCE verification_bookmark_ids")
    await client.query("SELECT setval('pg_temp.verification_bookmark_ids', COALESCE(MAX(id), 0) + 1, false) FROM bookmarks")
    await client.query("ALTER TABLE pg_temp.bookmarks ALTER COLUMN id SET DEFAULT nextval('pg_temp.verification_bookmark_ids')")

    await check("migration preserves all existing bookmarks", async () => {
        const rows = (await client.query("SELECT id::text, user_id::text, desertion_no::text, created_at FROM bookmarks ORDER BY id")).rows
        assert.deepEqual(rows, originalBookmarks)
        assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM bookmarks WHERE source_type <> 'rescue'")).rows[0].n, 0)
    })
    for (const source of ["rescue", "pawinhand", "both"]) {
        await check(`${source}: list, detail, pagination, dates and source images`, async () => {
            if (source === "rescue") await client.query("DELETE FROM pg_temp.pawinhand_animals")
            if (source === "pawinhand") await client.query("DELETE FROM pg_temp.rescue_animals")
            const expected = (await client.query(`SELECT source_type, animal_id::text AS animal_id FROM (${animalsSql}) r
                WHERE notice_edt >= CURRENT_DATE ORDER BY notice_sdt DESC NULLS LAST, source_type ASC, r.animal_id DESC`)).rows
            const first = await animals.getAnimals({ size: "3" })
            const second = await animals.getAnimals({ size: "3", page: "2" })
            assert.equal(first.total, expected.length)
            assert.deepEqual([...first.items, ...second.items].map(({ source_type, animal_id }) => ({ source_type, animal_id })), expected.slice(0, 6))
            for (const item of first.items) {
                assert.equal(typeof item.animal_id, "string")
                assert.ok(item.days_until_end >= 0)
                const detail = await animals.getAnimal(item.animal_id, null, item.source_type)
                assert.equal(detail.animal_id, item.animal_id)
                assert.equal(detail.is_bookmarked, false)
                for (const key of ["source_type", "source_id", "desertion_no", "images", "species", "breed", "color", "color_tags", "sex", "neuter_yn", "special_mark", "happen_place", "happen_dt", "notice_start_date", "notice_end_date", "days_until_end", "care_name", "care_tel", "care_addr"]) assert.ok(key in detail)
                if (item.source_type === "rescue") assert.deepEqual(await animals.getAnimal(item.animal_id, null), detail)
                else for (const key of ["notice_no", "detail_url", "process_state", "age", "weight"]) assert.ok(key in detail)
                const fk = item.source_type === "rescue" ? "desertion_no" : "pawinhand_animal_id"
                const images = (await client.query(`SELECT image_url FROM images WHERE post_type=$1 AND ${fk}=$2 ORDER BY id`, [item.source_type, item.animal_id])).rows.map((row) => row.image_url)
                assert.deepEqual(detail.images, images)
                assert.equal(item.image_url, images[0] ?? null)
            }
            if (!expected.length) return "No currently active source rows; empty list verified, populated detail unavailable"
            if (source === "both" && new Set(expected.map((row) => row.source_type)).size < 2) {
                return "Combined query verified with available rows; populated two-source pagination unavailable"
            }
        })
    }
    await check("today boundary and expired detail", async () => {
        const today = (await client.query(`SELECT source_type, animal_id::text FROM (${animalsSql}) r WHERE notice_edt = CURRENT_DATE LIMIT 1`)).rows[0]
        const expired = (await client.query(`SELECT source_type, animal_id::text FROM (${animalsSql}) r WHERE notice_edt < CURRENT_DATE LIMIT 1`)).rows[0]
        if (expired) assert.equal(await animals.getAnimal(expired.animal_id, null, expired.source_type), null)
        if (today) assert.equal((await animals.getAnimal(today.animal_id, null, today.source_type)).days_until_end, 0)
        if (!today || !expired) return "Actual data does not cover both today and expired dates; no synthetic rows added"
    })
    await check("invalid sources and precision-unsafe IDs", async () => {
        await assert.rejects(animals.getAnimal("1", null, "unknown"), { status: 400, code: "INVALID_SOURCE_TYPE" })
        await assert.rejects(animals.getAnimal("9223372036854775808", null), { status: 400 })
        await assert.rejects(bookmarks.addBookmark({ userId: "1", animalId: Number.MAX_SAFE_INTEGER + 1, sourceType: "rescue" }), { status: 400 })
    })
    const user = (await client.query("SELECT id::text FROM public.users ORDER BY id LIMIT 1")).rows[0]
    await check("bookmark CHECK and foreign-key constraints", async () => {
        const rescue = (await client.query("SELECT desertion_no::text FROM rescue_animals LIMIT 1")).rows[0]
        if (!user || !rescue) return "No actual user or rescue animal available"
        const invalid = [
            ["rescue", null, null],
            ["pawinhand", rescue.desertion_no, null],
            ["rescue", rescue.desertion_no, rescue.desertion_no],
            ["unknown", rescue.desertion_no, null],
        ]
        for (const params of invalid) {
            await client.query("SAVEPOINT invalid_reference")
            await assert.rejects(client.query("INSERT INTO bookmarks(user_id, source_type, desertion_no, pawinhand_animal_id) VALUES($1,$2,$3,$4)", [user.id, ...params]), { code: "23514" })
            await client.query("ROLLBACK TO SAVEPOINT invalid_reference")
            await client.query("RELEASE SAVEPOINT invalid_reference")
        }
        assert.equal((await client.query("SELECT COUNT(*)::int AS n FROM pg_constraint WHERE conrelid='pg_temp.bookmarks'::regclass AND contype='f' AND confrelid='pg_temp.pawinhand_animals'::regclass")).rows[0].n, 1)
    })
    await check("combined species, breed, colors, region and date filters", async () => {
        const row = (await client.query(`SELECT * FROM (${animalsSql}) r WHERE notice_edt >= CURRENT_DATE AND kind_nm IN (SELECT name FROM breeds) LIMIT 1`)).rows[0]
        if (!row) return "No active animal with a catalog breed"
        const date = (await client.query("SELECT TO_CHAR($1::date, 'YYYY-MM-DD') AS value", [row.happen_dt])).rows[0].value
        const filters = { species: row.up_kind_nm, breed: row.kind_nm, color: row.color_tags ?? [], sido: row.region_sido, sigungu: row.region_sigungu, start_date: date, end_date: date }
        const result = await animals.getAnimals(filters)
        assert.ok(result.total > 0)
        for (const item of result.items) {
            assert.equal(item.species, row.up_kind_nm)
            assert.equal(item.breed, row.kind_nm)
            if (date) assert.equal(item.happen_dt, date)
            if (row.color_tags?.length) assert.ok(item.color_tags.some((color) => row.color_tags.includes(color)))
        }
    })
    for (const source of ["rescue", "pawinhand"]) {
        await check(`${source}: bookmark create, duplicate, list, detail flag, summary and delete`, async () => {
            const animal = (await client.query(`SELECT animal_id::text FROM (${animalsSql}) r WHERE source_type=$1 ORDER BY notice_edt DESC NULLS LAST LIMIT 1`, [source])).rows[0]
            if (!user || !animal) return "No actual user or source animal available"
            await client.query("DELETE FROM pg_temp.bookmarks WHERE user_id=$1", [user.id])
            const payload = source === "rescue" ? { desertionNo: animal.animal_id } : { sourceType: source, animalId: animal.animal_id }
            const added = await bookmarks.addBookmark({ userId: user.id, ...payload })
            assert.equal(added.source_type, source)
            await assert.rejects(bookmarks.addBookmark({ userId: user.id, sourceType: source, animalId: animal.animal_id }), { status: 409 })
            const list = (await bookmarks.getBookmarks(user.id)).items
            assert.equal(list.length, 1)
            assert.equal(list[0].animal_id, animal.animal_id)
            for (const key of ["bookmark_id", "source_type", "animal_id", "desertion_no", "source_id", "image_url", "species", "breed", "happen_place", "notice_end_date", "is_expired", "created_at"]) assert.ok(key in list[0])
            const detail = await animals.getAnimal(animal.animal_id, user.id, source)
            if (detail) assert.equal(detail.is_bookmarked, true)
            const summary = await getSummary(user.id)
            assert.equal(summary.counts.bookmarks, 1)
            assert.equal(summary.bookmark_previews[0].source_type, source)
            assert.equal(summary.bookmark_previews[0].bookmark_id, added.bookmark_id)
            await bookmarks.removeBookmark({ userId: user.id, bookmarkId: added.bookmark_id })
            assert.equal((await bookmarks.getBookmarks(user.id)).items.length, 0)
        })
    }
    await check("FAQ published ordering and empty response", async () => {
        const expected = (await client.query("SELECT id::text, question, answer, display_order FROM faqs WHERE status='published' ORDER BY display_order, id")).rows
        assert.deepEqual((await getFaqs()).items, expected)
        await client.query("DELETE FROM pg_temp.faqs WHERE status='published'")
        assert.deepEqual(await getFaqs(), { items: [] })
    })
    await check("found list retains numbering and exposes card fields", async () => {
        const list = await getPosts({})
        for (const [index, item] of list.items.entries()) {
            assert.equal(item.no, list.total - index)
            for (const key of ["primary_image_url", "species", "breed", "color", "find_date"]) assert.ok(key in item)
            const image = (await client.query("SELECT image_url FROM images WHERE post_type='found' AND found_post_id=$1 ORDER BY created_at, id LIMIT 1", [item.id])).rows[0]
            assert.equal(item.primary_image_url, image?.image_url ?? null)
        }
        if (!list.items.length) return "No active found posts; empty response verified"
    })
    server = app.listen(0, "127.0.0.1")
    await new Promise((resolve) => server.once("listening", resolve))
    const base = `http://127.0.0.1:${server.address().port}`
    await check("public FAQ route and invalid source HTTP status", async () => {
        const response = await fetch(`${base}/faqs`)
        assert.equal(response.status, 200)
        assert.deepEqual((await response.json()).data, await getFaqs())
        const invalid = await fetch(`${base}/rescue-animals/invalid/1`)
        assert.equal(invalid.status, 400)
        assert.equal((await invalid.json()).error.code, "INVALID_SOURCE_TYPE")
    })
    for (const admin of [false, true]) {
        await check(`auth/me and public user safety: is_admin=${admin}`, async () => {
            const row = (await client.query("SELECT * FROM public.users WHERE is_admin=$1 LIMIT 1", [admin])).rows[0]
            if (!row) return "No actual user of this role"
            const publicUser = toPublicUser(row)
            assert.equal(publicUser.is_admin, admin)
            assert.deepEqual(Object.keys(publicUser).sort(), ["id", "email", "name", "provider", "is_admin", "createdAt", "lastLogin"].sort())
            const response = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${createAccessToken(row.id)}` } })
            assert.equal(response.status, 200)
            assert.equal((await response.json()).data.user.is_admin, admin)
        })
    }
    await check("signup/login reject missing fields", async () => {
        await assert.rejects(signup({}), { status: 400, code: "MISSING_FIELD" })
        await assert.rejects(login({}), { status: 400, code: "MISSING_FIELD" })
    })
} finally {
    if (server) await new Promise((resolve) => server.close(resolve))
    await client.query("ROLLBACK")
    pool.query = originalQuery
    client.release()
    await pool.end()
    console.log(JSON.stringify(results, null, 2))
    if (results.some((result) => result.status === "FAIL")) process.exitCode = 1
}
