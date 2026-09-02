/**
 * care_addr(보호소 주소) 문자열에서 시/도, 시/군/구를 뽑아낸다.
 * 예)
 *   "경상남도 창원시 성산구 공단로474번길 117 (상복동) 창원동물보호센터"
 *     -> { sido: "경상남도", sigungu: "창원시 성산구" }
 *   "전북특별자치도 부안군 주산면 주산로 369  부안군 동물보호센터"
 *     -> { sido: "전북특별자치도", sigungu: "부안군" }
 *   "세종특별자치시 조치원읍 ..."   -> { sido: "세종특별자치시", sigungu: null }
 *   "번영로 98-3 동방맨션 앞"        -> { sido: null, sigungu: null }
 */

// 옛날 시도명 -> 법정동코드 기준 최신 시도명 (regions 드롭다운과 맞추기 위함)
// 광주광역시 / 전라남도는 소스 데이터의 "전남광주통합특별시"로 통일한다.
const SIDO_ALIASES = {
    "강원도": "강원특별자치도",
    "전라북도": "전북특별자치도",
    "전라남도": "전남광주통합특별시",
    "광주광역시": "전남광주통합특별시",
    "제주도": "제주특별자치도"
}

const SIDO_SET = new Set([
    "서울특별시", "부산광역시", "대구광역시", "인천광역시", "대전광역시", "울산광역시",
    "세종특별자치시", "경기도", "충청북도", "충청남도", "경상북도", "경상남도",
    "강원특별자치도", "전북특별자치도", "제주특별자치도", "전남광주통합특별시",
])

export function parseRegion(careAddr) {
    const empty = { sido: null, sigungu: null }
    if (!careAddr || typeof careAddr !== "string") return empty

    const tokens = careAddr.trim().split(/\s+/)
    if (tokens.length === 0 || tokens[0] === "") return empty

    const sido = SIDO_ALIASES[tokens[0]] ?? tokens[0]
    if (!SIDO_SET.has(sido)) return empty   // 예상 못 한 포맷은 버린다.
    if (sido === "세종특별자치시") return { sido, sigungu: null } // 시군구 레벨 없음

    const t1 = tokens[1] ?? ""
    const t2 = tokens[2] ?? ""

    // "창원시 성산구", "성남시 분당구" 처럼 시 + 행정구 조합
    if (/시$/.test(t1) && /구$/.test(t2)) {
        return { sido, sigungu: `${t1} ${t2}` }
    }
    // "부안군", "제주시", "종로구" 등 단일 시/군/구
    if (/(시|군|구)$/.test(t1)) {
        return { sido, sigungu: t1 }
    }
    return { sido, sigungu: null }
}