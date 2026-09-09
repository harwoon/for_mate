import * as service from "./matches.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 6.1 AI 매칭 결과 조회
export async function getMatches(req, res, next) {
  try {
    const lostPostId = Number(req.params.id)
    const results = await service.getMatches(lostPostId)
    ok(res, results)
  } catch (err) {
    next(err)
  }
}

// 6.2 매칭 상세 비교 조회
export async function getMatchDetail(req, res, next) {
  try {
    const matchId = Number(req.params.matchId)
    const result = await service.getMatchDetail(matchId, req.userId)
    ok(res, result)
  } catch (err) {
    next(err)
  }
}