import * as repository from "./catalog.repository.js"
import { readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const REGION_PATH = path.join(path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../constants/regions.json"
))

// 공용 constants 파일은 다른 기능에서도 사용하므로 수정하지 않고,
// API 명세에 정의된 색상 목록을 카탈로그 모듈 내부에서 관리한다.
const CATALOG_COLOR_TAGS = [
    "흰색",
    "검은색",
    "갈색",
    "황색",
    "회색",
    "크림색",
    "기타"
]

let cache = null

// 2.1 품종 목록 조회 (자동완성)
// species는 정확히 일치하는 동물 종류를, keyword는 이름에 포함된 품종을 찾는다.
export async function getBreeds({ species, keyword }) {
    const items = await repository.findBreeds({ species, keyword })
    return { items }
}

// 2.2 색상 태그 목록 조회
export async function getColorTags() {
    return { items: [...CATALOG_COLOR_TAGS] }
}

// - getRegions: 2.3 지역 목록 조회
export async function getRegions(parent) {
    if (!cache) cache = JSON.parse(await readFile(REGION_PATH, "utf-8"))

    // parent가 없으면 시/도 목록을 반환한다.
    if (!parent) return { items: Object.keys(cache) }

    const sigungu = cache[parent]
    if (!sigungu) {
        const error = new Error("없는 시/도입니다.")
        error.status = 400
        error.code = "INVALID_SIDO"
        throw error
    }
    // parent가 있으면 해당 시/도의 시/군/구 목록을 반환한다.
    return { items: sigungu }
}
