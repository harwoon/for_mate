import * as repository from "./bookmarks.repository.js"

function serviceError(message, status, code) {
    const error = new Error(message)

    error.status = status
    error.code = code

    return error
}

function parseDesertionNo(desertionNo) {
    const value = String(desertionNo ?? "").trim()

    if (!/^\d+$/.test(value)) {
        throw serviceError(
            "desertion_no 값이 올바르지 않습니다.",
            400,
            "INVALID_DESERTION_NO"
        )
    }

    if (BigInt(value) > 9223372036854775807n) {
        throw serviceError(
            "desertion_no 값이 올바르지 않습니다.",
            400,
            "INVALID_DESERTION_NO"
        )
    }

    return value
}

function parseBookmarkId(bookmarkId) {
    const id = Number(bookmarkId)

    if (!Number.isInteger(id) || id <= 0) {
        throw serviceError(
            "북마크 ID가 올바르지 않습니다.",
            400,
            "INVALID_BOOKMARK_ID"
        )
    }

    return id
}


// 7.1 북마크 등록
export async function addBookmark({ userId, desertionNo }) {
    const parsedDesertionNo = parseDesertionNo(desertionNo)

    const rescueAnimal =
        await repository.findRescueAnimalByDesertionNo(parsedDesertionNo)

    if (!rescueAnimal) {
        throw serviceError(
            "구조동물 공고를 찾을 수 없습니다.",
            404,
            "RESCUE_ANIMAL_NOT_FOUND"
        )
    }

    const existingBookmark =
        await repository.findByUserAndDesertionNo(
            userId,
            parsedDesertionNo
        )

    if (existingBookmark) {
        throw serviceError(
            "이미 북마크한 공고입니다.",
            409,
            "BOOKMARK_ALREADY_EXISTS"
        )
    }

    const bookmark = await repository.create(
        userId,
        parsedDesertionNo
    )

    return {
        bookmark_id: bookmark.id,
        desertion_no: bookmark.desertion_no,
        created_at: bookmark.created_at
    }
}

// 7.2 북마크 목록 조회
export async function getBookmarks(userId) {
    const items = await repository.findMany(userId)

    return {
        items
    }
}

// 7.3 북마크 삭제
export async function removeBookmark({ userId, bookmarkId }) {
    const id = parseBookmarkId(bookmarkId)

    const bookmark = await repository.findById(id)

    if (!bookmark) {
        throw serviceError(
            "북마크를 찾을 수 없습니다.",
            404,
            "BOOKMARK_NOT_FOUND"
        )
    }

    if (String(bookmark.user_id) !== String(userId)) {
        throw serviceError(
            "본인의 북마크만 삭제할 수 있습니다.",
            403,
            "FORBIDDEN"
        )
    }

    await repository.remove(id)

    return null
}