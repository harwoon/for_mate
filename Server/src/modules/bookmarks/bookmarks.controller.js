import * as service from "./bookmarks.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 7.1 북마크 등록
export async function addBookmark(req, res, next) {
	try {
		const bookmark = await service.addBookmark({
			userId: req.userId,
			desertionNo: req.body.desertion_no
		})

		created(res, bookmark)

	} catch (err) {
		next(err)
	}
}

// 7.2 북마크 목록 조회
export async function getBookmarks(req, res, next) {
	try {
		const result = await service.getBookmarks(req.userId)

		ok(res, result)

	} catch (err) {
		next(err)
	}
}

// 7.3 북마크 삭제
export async function removeBookmark(req, res, next) {
	try {
		const result = await service.removeBookmark({
			userId: req.userId,
			bookmarkId: req.params.bookmarkId
		})

		ok(res, result)

	} catch (err) {
		next(err)
	}
}