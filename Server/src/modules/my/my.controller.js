import * as service from "./my.service.js"
import { ok } from "../../utils/response.js"

// 8.1 마이페이지 요약 조회
export async function getSummary(req, res, next) {
	try {
		const result = await service.getSummary(req.userId)

		ok(res, result)
	} catch (err) {
		next(err)
	}
}

// 8.2 내 실종 공고 목록 조회
export async function getMyLostPosts(req, res, next) {
	try {
		const result = await service.getMyLostPosts({
			userId: req.userId,
			query: req.query
		})
		ok(res, result)
	} catch (err) {
		next(err)
	}
}

// 8.3 내 발견제보 목록 조회
export async function getMyFoundPosts(req, res, next) {
	try {
		const result = await service.getMyFoundPosts({
			userId: req.userId,
			query: req.query
		})

		ok(res, result)
	} catch (err) {
		next(err)
	}
}
