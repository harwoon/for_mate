import { readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

// 이용약관 / 개인정보처리방침 / 서비스소개는 breeds나 lost_posts처럼 사용자가 만드는 데이터가 아니라
// "개발자가 가끔 문구를 수정해서 배포하는" 정적 텍스트다. 그래서 catalog 모듈의 지역(regions.json)과
// 똑같은 이유로 DB 테이블 대신 JSON 파일로 관리한다.
// (실제로 db/schema.sql에도 이 내용을 담을 테이블은 없다 - 정적 페이지는 DB에 넣을 이유가 없기 때문)
const CONTENT_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../constants/pages_content.json"
)

// catalog.service.js의 getRegions와 같은 이유로 메모리 캐시를 둔다.
// 서버가 켜져 있는 동안에는 파일 내용이 바뀔 일이 없으므로, 요청이 올 때마다 디스크를 다시 읽지 않고
// 최초 1회만 읽어서 메모리에 담아둔 뒤 계속 재사용한다. (문구를 바꾸려면 파일을 고치고 서버를 재시작하면 된다)
let cache = null

async function loadContent() {
  if (!cache) cache = JSON.parse(await readFile(CONTENT_PATH, "utf-8"))
  return cache
}

// terms / privacy / about 세 함수가 하는 일이 완전히 같아서(파일에서 해당 키만 꺼내주기) 공통 함수로 뺐다.
async function getPageContent(key) {
  const content = await loadContent()
  const page = content[key]

  if (!page) {
    // 이 경우는 사용자 잘못이 아니라 서버 쪽 데이터 파일이 아직 준비되지 않은 상황이므로,
    // Client/src/api/client.js가 error.status / error.code를 읽어 처리할 수 있게 형식을 맞춰서 던진다.
    const error = new Error("아직 준비되지 않은 페이지입니다.")
    error.status = 404
    error.code = "PAGE_NOT_FOUND"
    throw error
  }

  return page
}

// 12. 이용약관
export function getTerms() {
  return getPageContent("terms")
}

// 12. 개인정보처리방침
export function getPrivacy() {
  return getPageContent("privacy")
}

// 12. 서비스소개
export function getAbout() {
  return getPageContent("about")
}
