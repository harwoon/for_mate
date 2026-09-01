import * as repository from "./notifications.repository.js"

// 알림은 새벽 배치에서 자동으로 생성된다. (jobs/rescueAnimalSync.job.js 참고)
function serviceError(message, status, code) {
    const error = new Error(message)

    error.status = status
    error.code = code

    return error
}

function parseNotificationId(notificationId) {
    const id = Number(notificationId)

    if (!Number.isInteger(id) || id <= 0) {
        throw serviceError(
            "알림 ID가 올바르지 않습니다.",
            400,
            "INVALID_NOTIFICATION_ID"
        )
    }

    return id
}


// 9.1 알림 목록 조회
export async function getNotifications(userId) {
    const items = await repository.findMany(userId)

    return {
        items
    }
}

// 9.2 알림 읽음 처리
export async function readNotification({ userId, notificationId }) {
    const id = parseNotificationId(notificationId)

    const notification = await repository.findById(id)

    if (!notification) {
        throw serviceError(
            "알림을 찾을 수 없습니다.",
            404,
            "NOTIFICATION_NOT_FOUND"
        )
    }

    if (String(notification.user_id) !== String(userId)) {
        throw serviceError(
            "본인의 알림만 확인할 수 있습니다.",
            403,
            "FORBIDDEN"
        )
    }

    return repository.markAsRead(id)
}