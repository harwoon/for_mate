import * as service from "./rescue-animals.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 5.1 구조동물 목록 조회 (필터링)
export async function getAnimals(req, res, next) {
  try {
    // TODO: 필터 + 페이지네이션, notice_edt 지난 공고는 제외
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 5.2 구조동물 상세 조회
export async function getAnimal(req, res, next) {
  try {
    // TODO: 보호소 정보, 공고 기간, is_ending_soon 포함해서 반환
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
