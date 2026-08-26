import * as service from "./catalog.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 2.1 품종 목록 조회 (자동완성)
export async function getBreeds(req, res, next) {
  try {
    // TODO: species, keyword로 breeds 테이블 검색
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 2.2 색상 태그 목록 조회
export async function getColorTags(req, res, next) {
  try {
    // TODO: constants의 COLOR_TAGS 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 2.3 지역 목록 조회
export async function getRegions(req, res, next) {
  try {
    // TODO: parent가 있으면 시군구, 없으면 시/도 목록 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
