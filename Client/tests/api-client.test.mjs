import test from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

const source = (await readFile(new URL("../src/api/client.js", import.meta.url), "utf8"))
  .replace("import.meta.env.VITE_API_BASE_URL", '"https://api.example.test/"')
let serial = 0
async function setup(handler) {
  const redirects = []
  const events = []
  globalThis.window = {
    location: { pathname: "/protected", assign: (url) => redirects.push(url) },
    dispatchEvent: (event) => events.push(event.type),
  }
  globalThis.fetch = handler
  const api = await import(`data:text/javascript;base64,${Buffer.from(source + `\n// ${serial++}`).toString("base64")}`)
  return { api, redirects, events }
}
const unauthorized = () => new Response(JSON.stringify({ error: { code: "UNAUTHORIZED" } }), { status: 401 })
const success = () => new Response(null, { status: 204 })

test("concurrent and late 401 responses share one refresh and retry once", async () => {
  let refreshes = 0
  const calls = new Map()
  let releaseLate
  const late = new Promise((resolve) => { releaseLate = resolve })
  const { api } = await setup(async (url, options) => {
    assert.equal(options.credentials, "include")
    if (url.endsWith("/auth/refresh")) { refreshes++; return success() }
    const count = (calls.get(url) || 0) + 1
    calls.set(url, count)
    if (count === 1) {
      if (url.endsWith("/late")) await late
      return unauthorized()
    }
    return success()
  })
  const pending = api.get("/late")
  await Promise.all([api.get("/one"), api.get("/two")])
  releaseLate()
  await pending
  assert.equal(refreshes, 1)
  assert.deepEqual([...calls.values()], [2, 2, 2])
})

test("a retried 401 does not loop and clears login state", async () => {
  let calls = 0
  let refreshes = 0
  const { api, redirects, events } = await setup(async (url) => {
    if (url.endsWith("/auth/refresh")) { refreshes++; return success() }
    calls++; return unauthorized()
  })
  await assert.rejects(api.get("/protected"), { status: 401 })
  assert.equal(calls, 2)
  assert.equal(refreshes, 1)
  assert.deepEqual(redirects, ["/login"])
  assert.deepEqual(events, ["auth:expired"])
})

test("refresh failure is shared, and anonymous bootstrap does not redirect", async () => {
  let refreshes = 0
  const { api, redirects } = await setup(async (url) => {
    if (url.endsWith("/auth/refresh")) refreshes++
    return unauthorized()
  })
  await assert.rejects(api.get("/auth/me", { redirectOnAuthFailure: false }))
  assert.deepEqual(redirects, [])
  await Promise.allSettled([api.get("/one"), api.get("/two")])
  assert.equal(refreshes, 1)
  assert.ok(redirects.every((url) => url === "/login"))
})

test("login, signup and refresh do not automatically refresh", async () => {
  const calls = []
  const { api } = await setup(async (url) => { calls.push(url); return unauthorized() })
  for (const path of ["/auth/login", "/auth/signup", "/auth/refresh"]) {
    await assert.rejects(api.post(path), { status: 401 })
  }
  assert.equal(calls.length, 3)
})

test("multipart PUT is replayed unchanged without Content-Type; image URLs resolve", async () => {
  const form = new FormData()
  let calls = 0
  const { api } = await setup(async (url, options) => {
    if (url.endsWith("/auth/refresh")) return success()
    assert.equal(options.method, "PUT")
    assert.equal(options.body, form)
    assert.equal(options.headers, undefined)
    return ++calls === 1 ? unauthorized() : success()
  })
  await api.put("/found-posts/1", form)
  assert.equal(calls, 2)
  assert.equal(api.imageUrl("/uploads/photo.jpg"), "https://api.example.test/uploads/photo.jpg")
  assert.equal(api.imageUrl("https://external.test/photo.jpg"), "https://external.test/photo.jpg")
  assert.equal(api.imageUrl("http://external.test/photo.jpg"), "http://external.test/photo.jpg")
  assert.equal(api.imageUrl(null), null)
})
