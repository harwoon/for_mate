import * as repository from "./catalog.repository.js"
import { readFile } from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const REGION_PATH = path.join(path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../constants/regions.json"
))

let cache = null

// TODO: 아래 컨트롤러에서 호출할 함수들을 구현한다
// - getBreeds: 2.1 품종 목록 조회 (자동완성)
// - getColorTags: 2.2 색상 태그 목록 조회

// - getRegions: 2.3 지역 목록 조회
export async function getRegions(parent) {
    if (!cache) cache = JSON.parse(await readFile(REGION_PATH, "utf-8"))

    if (!parent) return { sido: Object.keys(cache) }

    const sigungu = cache[parent]
    if (!sigungu) {
        const error = new Error("없는 시/도입니다.")
        error.status = 400
        error.code = "INVALID_SIDO"
        throw error
    }
    return { sido: parent, sigungu }
}
