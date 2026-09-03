import * as service from "./catalog.service.js"
import { ok } from "../../utils/response.js"

// 2.1 품종 목록 조회 (자동완성)
export async function getBreeds(req, res, next) {
  try {
    // species와 keyword는 선택값이며, 앞뒤 공백을 제거한 뒤 서비스로 전달한다.
    const species = req.query.species?.trim() || null
    const keyword = req.query.keyword?.trim() || null

    ok(res, await service.getBreeds({ species, keyword }))
  } catch (err) {
    next(err)
  }
}

// 2.2 색상 태그 목록 조회
export async function getColorTags(req, res, next) {
  try {
    // 카탈로그에서 선택 가능한 표준 색상 목록을 반환한다.
    ok(res, await service.getColorTags())
  } catch (err) {
    next(err)
  }
}

// 2.3 지역 목록 조회
export async function getRegions(req, res, next) {
  try {
    // TODO: parent가 있으면 시군구, 없으면 시/도 목록 반환
    ok(res, await service.getRegions(req.query.parent?.trim() || null))
  } catch (err) {
    next(err)
  }
}
