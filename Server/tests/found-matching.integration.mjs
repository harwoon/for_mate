// Run from Server: node --env-file=.env tests/found-matching.integration.mjs
// All database writes use temporary tables inside one transaction and are rolled back.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pool } from "../src/db/pool.js"
import * as matches from "../src/modules/matches/matches.service.js"
import * as repository from "../src/modules/matches/matches.repository.js"
import { getMyMatches } from "../src/modules/my/my.service.js"
import { findSummary } from "../src/modules/my/my.repository.js"
import { getMatches as getAdminMatches } from "../src/modules/admin/admin.service.js"
import { getNotifications } from "../src/modules/notifications/notifications.service.js"
import { createPost, updatePost } from "../src/modules/found-posts/found-posts.service.js"
import { notifyNewMatches } from "../src/jobs/notifyNewMatches.js"
import { markDuplicatePawinhandAnimals } from "../src/jobs/markDuplicateAnimals.js"

const client = await pool.connect()
const originalQuery = pool.query
const originalConnect = pool.connect
const originalFetch = globalThis.fetch
let queue = Promise.resolve()
pool.query = (...args) => {
    const next = queue.then(() => client.query(...args))
    queue = next.catch(() => {})
    return next
}
// Keep one outer transaction even with a transaction-pooling database endpoint.
pool.connect = async () => ({
    query: (sql, params) => client.query({
        BEGIN: "SAVEPOINT service_transaction",
        COMMIT: "RELEASE SAVEPOINT service_transaction",
        ROLLBACK: "ROLLBACK TO SAVEPOINT service_transaction"
    }[sql] ?? sql, params),
    release: () => {}
})
const vector = JSON.stringify([1, ...Array(511).fill(0)])
const dog = "개"
let checks = 0
async function check(name, fn) {
    console.log(`CHECK: ${name}`)
    await fn()
    checks += 1
    console.log(`PASS: ${name}`)
}

try {
    await client.query("BEGIN")
    await client.query("SET LOCAL statement_timeout = '15s'")
    const schema = await readFile(new URL("../src/db/schema.sql", import.meta.url), "utf8")
    // A transaction pooler can retain fixtures from an interrupted earlier run.
    if ((await client.query("SELECT to_regclass('pg_temp.users') AS fixture")).rows[0].fixture) {
        const owners = (await client.query("SELECT email FROM pg_temp.users")).rows
        assert.deepEqual(owners, [{ email: "owner@example.invalid" }])
        for (const [, table] of schema.matchAll(/CREATE TABLE (\w+)/g)) {
            await client.query(`DROP TABLE IF EXISTS pg_temp.${table} CASCADE`)
        }
    }
    await client.query(schema.replaceAll("CREATE TABLE ", "CREATE TEMP TABLE "))
    for (const table of ["users", "found_posts", "lost_posts", "images", "embeddings", "matches", "notifications", "pawinhand_animals"]) {
        assert.equal((await client.query("SELECT relpersistence FROM pg_class WHERE oid = to_regclass($1)", [table])).rows[0].relpersistence, "t")
    }
    await check("found migrations apply to the prior two-source tables", async () => {
        await client.query("ALTER TABLE pg_temp.matches DROP COLUMN found_post_id CASCADE")
        await client.query("ALTER TABLE pg_temp.notifications DROP COLUMN found_post_id CASCADE")
        for (const file of ["014_matches_found_source.sql", "015_notifications_found_source.sql"]) {
            const migration = await readFile(new URL(`../src/db/migrations/${file}`, import.meta.url), "utf8")
            await client.query(migration.replace(/^\s*(BEGIN|COMMIT);/gm, ""))
        }
    })
    await client.query("INSERT INTO users(id, name, email) VALUES (1, 'owner', 'owner@example.invalid')")
    await client.query("INSERT INTO lost_posts(id,user_id,pet_name,species,region,event_date) VALUES (1,1,'pet',$1,'Seoul',CURRENT_DATE - 1)", [dog])
    await client.query("INSERT INTO found_posts(id,user_id,title,species,breed,color,region,find_date,status) SELECT id,1,'found',$1,'breed','white','Seoul Gangnam',CURRENT_DATE,CASE WHEN id=2 THEN 'blind' ELSE 'active' END FROM generate_series(1,5) id", [dog])
    await client.query("INSERT INTO rescue_animals(desertion_no,up_kind_nm,happen_dt) VALUES (1,$1,CURRENT_DATE)", [dog])
    await client.query("INSERT INTO pawinhand_animals(id,source_id,detail_url,up_kind_nm,happen_dt) VALUES (1,'p1','https://example.invalid',$1,CURRENT_DATE)", [dog])
    await client.query("INSERT INTO model_versions(id,version_key,backbone,is_active) VALUES (1,'active','test',TRUE),(2,'old','test',FALSE)")
    await client.query("INSERT INTO embedding_spaces(id,model_version_id,space_key,species,checkpoint_name,preprocessing_key,is_usable) VALUES (1,1,'dog',$1,'test','test',TRUE),(2,2,'old',$1,'test','test',TRUE),(3,1,'disabled',$1,'test','test',FALSE),(4,1,'cat','고양이','test','test',TRUE)", [dog])
    await client.query("INSERT INTO images(id,post_type,lost_post_id,image_url) VALUES (1,'lost',1,'/lost.jpg')")
    await client.query("INSERT INTO images(id,post_type,found_post_id,image_url) SELECT id+10,'found',id,'/found-' || id || '.jpg' FROM found_posts")
    await client.query("INSERT INTO images(id,post_type,desertion_no,image_url) VALUES (21,'rescue',1,'/rescue.jpg')")
    await client.query("INSERT INTO images(id,post_type,pawinhand_animal_id,image_url) VALUES (22,'pawinhand',1,'/paw.jpg')")
    await client.query("INSERT INTO embeddings(image_id,embedding_space_id,embedding,model_version) SELECT image_id,space,$1::vector,'test' FROM (VALUES (1,1),(11,1),(12,1),(13,2),(14,3),(15,4),(21,1),(22,1)) v(image_id,space)", [vector])

    let foundMatch
    await check("all three sources; inactive, unusable, wrong-species and blind candidates excluded", async () => {
        const result = await matches.getMatches(1, 1, {})
        assert.deepEqual(result.items.map((x) => x.source_type).sort(), ["found", "pawinhand", "rescue"])
        foundMatch = result.items.find((x) => x.source_type === "found")
        assert.equal(String(foundMatch.found_post_id), "1")
        assert.equal(foundMatch.breed, "breed")
        assert.equal(foundMatch.color, "white")
        assert.equal(foundMatch.happen_place, "Seoul Gangnam")
        assert.equal(foundMatch.sex, null)
        assert.equal(foundMatch.neuter, null)
        assert.equal(foundMatch.notice_edt, null)
        assert.equal((await repository.findEmbeddingSpace("old", dog)).length, 0)
    })
    await check("found filters, daily upsert and comparison", async () => {
        const result = await matches.getMatches(1, 1, { source_type: "found", sido: "Seoul", sigungu: "Gangnam", sex: "U", neuter: "U" })
        assert.equal(result.items.length, 1)
        assert.equal(result.items[0].match_id, foundMatch.match_id)
        assert.equal((await matches.getMatchDetail(foundMatch.match_id, 1)).animal.id, 1)
    })
    await check("notification references, thumbnails and deduplication for all sources", async () => {
        await notifyNewMatches("found", [1,2,3,4,5])
        await notifyNewMatches("found", [1])
        await notifyNewMatches("rescue", [1])
        await notifyNewMatches("pawinhand", [1])
        const { items } = await getNotifications(1)
        assert.equal(items.length, 3)
        const found = items.find((x) => x.source_type === "found")
        assert.equal(found.animal_id, "1")
        assert.equal(found.thumbnail_url, "/found-1.jpg")
        assert.equal(found.region, "Seoul Gangnam")
    })
    await check("my history, summary and administrator history include found", async () => {
        const my = await getMyMatches({ userId: 1, query: { source_type: "found", sido: "Seoul", sigungu: "Gangnam" } })
        assert.equal(my.items.length, 1)
        assert.equal(my.items[0].animal.id, 1)
        assert.equal(my.items[0].animal.image_url, "/found-1.jpg")
        const summary = await findSummary(1)
        assert.ok(JSON.stringify(summary).includes("/found-1.jpg"))
        const admin = await getAdminMatches({ source_type: "found" })
        assert.ok(JSON.stringify(admin).includes("/found-1.jpg"))
    })
    await check("blind found notifications and comparison are hidden", async () => {
        await client.query("UPDATE found_posts SET status='blind' WHERE id=1")
        assert.equal((await getNotifications(1)).items.length, 2)
        await assert.rejects(matches.getMatchDetail(foundMatch.match_id, 1), { code: "MATCH_NOT_FOUND" })
        await client.query("UPDATE found_posts SET status='active' WHERE id=1")
    })
    await check("pawinhand deduplication never compares across spaces", async () => {
        await client.query("UPDATE embeddings SET embedding_space_id=2 WHERE image_id=21")
        await markDuplicatePawinhandAnimals()
        assert.equal((await client.query("SELECT duplicate_of_desertion_no FROM pawinhand_animals WHERE id=1")).rows[0].duplicate_of_desertion_no, null)
        await client.query("UPDATE embeddings SET embedding_space_id=1 WHERE image_id=21")
    })

    // Repository transactions use savepoints; the outer transaction stays open.
    await client.query("SELECT setval(pg_get_serial_sequence('pg_temp.found_posts','id'),100)")
    await client.query("SELECT setval(pg_get_serial_sequence('pg_temp.images','id'),100)")
    let finishFetch
    let notifyFinished
    const waitForNotification = () => new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Notification timed out")), 15000)
        notifyFinished = () => {
            clearTimeout(timeout)
            resolve()
        }
    })
    const routedQuery = pool.query
    pool.query = async (...args) => {
        const result = await routedQuery(...args)
        if (args[0].includes("INSERT INTO notifications")) notifyFinished?.()
        return result
    }
    globalThis.fetch = async (_url, options) => {
        const request = JSON.parse(options.body)
        await new Promise((resolve) => { finishFetch = resolve })
        for (const image of request.images) {
            const space = image.species === dog ? 1 : 4
            await client.query("INSERT INTO embeddings(image_id,embedding_space_id,embedding,model_version) VALUES ($1,$2,$3::vector,'test') ON CONFLICT DO NOTHING", [image.id, space, vector])
        }
        return { ok: true, json: async () => ({ results: [{ status: "duplicate_skipped" }] }) }
    }
    await check("create waits for AI completion before notifying; duplicate_skipped accepted", async () => {
        const post = await createPost({ userId: 1, body: { title: "new", species: dog, region: "Seoul", find_date: "2099-01-01" }, imageUrls: ["/new.jpg"] })
        assert.equal((await client.query("SELECT 1 FROM notifications WHERE found_post_id=$1", [post.id])).rowCount, 0)
        const done = waitForNotification()
        finishFetch()
        await done
        assert.equal((await client.query("SELECT 1 FROM notifications WHERE found_post_id=$1", [post.id])).rowCount, 1)
    })
    await check("image update notifies after AI response", async () => {
        await updatePost({ postId: 3, userId: 1, body: {}, imageUrls: ["/added.jpg"] })
        const done = waitForNotification()
        finishFetch()
        await done
        assert.equal((await client.query("SELECT 1 FROM notifications WHERE found_post_id=3")).rowCount, 1)
    })
    await check("AI failure does not fail species update API", async () => {
        globalThis.fetch = async () => ({ ok: false, status: 503 })
        const originalError = console.error
        console.error = () => {}
        try {
            const post = await updatePost({ postId: 3, userId: 1, body: { species: "고양이" } })
            assert.equal(post.species, "고양이")
        } finally {
            console.error = originalError
        }
    })
    await check("notification failure does not fail found creation API", async () => {
        let logged
        const failed = new Promise((resolve) => { logged = resolve })
        const originalError = console.error
        console.error = logged
        pool.query = async (...args) => {
            if (args[0].includes("FROM found_posts") && args[0].includes("AS happen_date")) {
                throw new Error("Simulated notification database failure")
            }
            return routedQuery(...args)
        }
        globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [{ status: "ok" }] }) })
        try {
            const post = await createPost({ userId: 1, body: { title: "notification failure", species: dog, region: "Seoul", find_date: "2099-01-01" }, imageUrls: ["/failure.jpg"] })
            await failed
            assert.ok(post.id)
        } finally {
            console.error = originalError
            pool.query = routedQuery
        }
    })
    console.log(`PASS: ${checks} found integration checks`)
} finally {
    await queue
    await client.query("ROLLBACK")
    pool.query = originalQuery
    pool.connect = originalConnect
    globalThis.fetch = originalFetch
    client.release()
    await pool.end()
}
