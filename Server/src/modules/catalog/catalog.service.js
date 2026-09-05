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

// 한글 음절에서 초성을 찾을 때 사용하는 유니코드 순서이다.
const HANGUL_INITIALS = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ",
    "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
]

// 검색어 전체가 초성으로만 구성됐는지 확인한다.
function isInitialSearch(keyword) {
    return keyword && [...keyword].every((letter) => HANGUL_INITIALS.includes(letter))
}

// "골든리트리버"를 "ㄱㄷㄹㅌㄹㅂ"처럼 변환한다.
// 한글 음절이 아닌 글자는 그대로 두어 숫자나 영문 품종명도 안전하게 처리한다.
function extractInitials(value) {
    return [...value].map((letter) => {
        const code = letter.charCodeAt(0)
        if (code < 0xAC00 || code > 0xD7A3) return letter.toLowerCase()

        const initialIndex = Math.floor((code - 0xAC00) / 588)
        return HANGUL_INITIALS[initialIndex]
    }).join("")
}

let cache = null

// 2.1 품종 목록 조회 (자동완성)
// species는 정확히 일치하는 동물 종류를, keyword는 이름에 포함된 품종을 찾는다.
export async function getBreeds({ species, keyword }) {
    // PostgreSQL의 ILIKE는 "ㄱ"과 "골든리트리버"를 연결하지 못하므로,
    // 초성 검색일 때는 종류에 해당하는 품종을 가져와 자바스크립트에서 비교한다.
    if (isInitialSearch(keyword)) {
        const candidates = await repository.findBreeds({ species, keyword: null })
        const items = candidates.filter((breed) => (
            extractInitials(breed.name).startsWith(keyword)
        ))
        return { items }
    }

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
