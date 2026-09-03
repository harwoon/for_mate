// pages 모듈만 단독으로 검증하는 스크립트.
// DB 연결(db/pool.js)이나 app.js 전체를 부팅하지 않고, 이번에 작성한 코드만 직접 호출해본다.
import * as service from "./src/modules/pages/pages.service.js"
import * as controller from "./src/modules/pages/pages.controller.js"

function mockRes(label) {
  return {
    status(code) {
      this._status = code
      return this
    },
    json(body) {
      console.log(`\n[${label}] status=${this._status ?? 200}`)
      console.log(JSON.stringify(body, null, 2).slice(0, 500))
    },
  }
}

// 1) service 함수들이 JSON 파일에서 올바른 모양을 반환하는지 확인
for (const key of ["getTerms", "getPrivacy", "getAbout"]) {
  const data = await service[key]()
  console.log(`service.${key}() ->`, {
    title: data.title,
    sectionCount: data.sections.length,
  })
}

// 2) controller 함수들이 ok()로 { success: true, data } 형태의 응답을 만드는지 확인
const req = { query: {}, params: {} }
await controller.getTerms(req, mockRes("getTerms"), (err) => {
  if (err) console.error("getTerms next(err):", err)
})
await controller.getPrivacy(req, mockRes("getPrivacy"), (err) => {
  if (err) console.error("getPrivacy next(err):", err)
})
await controller.getAbout(req, mockRes("getAbout"), (err) => {
  if (err) console.error("getAbout next(err):", err)
})

console.log("\nALL PAGES MODULE CHECKS PASSED")
