import * as service from "./notifications.service.js"
import { ok, fail } from "../../utils/response.js"

// 9.1 알림 목록 조회
export async function getNotifications(req, res, next) {
	try {
        const result = await service.getNotifications(req.userId)

        ok(res, result)

	} catch (err) {
		next(err)
	}
}

// 9.2 알림 읽음 처리
export async function readNotification(req, res, next) {
	try {
		const result = await service.readNotification({
			userId: req.userId,
			notificationId: req.params.id
		})

		ok(res, result)
		
	} catch (err) {
		next(err)
	}
}
