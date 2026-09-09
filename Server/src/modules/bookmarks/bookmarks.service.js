import { validateSourceType, parseAnimalId } from "../rescue-animals/animal-source.js"
import * as repository from "./bookmarks.repository.js"

function serviceError(message, status, code) {
    const error = new Error(message)

    error.status = status
    error.code = code

    return error
}

function parseBookmarkId(bookmarkId) {
    const id = parseAnimalId(bookmarkId, "INVALID_BOOKMARK_ID")

    if (BigInt(id) <= 0n) {
        throw serviceError(
            "북마크 ID가 올바르지 않습니다.",
            400,
            "INVALID_BOOKMARK_ID"
        )
    }

    return id
}


// 7.1 북마크 등록
export async function addBookmark({ userId, desertionNo, sourceType, animalId }) {
    const legacy = sourceType === undefined && animalId === undefined
    const source = validateSourceType(legacy ? "rescue" : sourceType)
    const id = parseAnimalId(legacy ? desertionNo : animalId,
        legacy ? "INVALID_DESERTION_NO" : "INVALID_ANIMAL_ID")
    if (!legacy && desertionNo !== undefined &&
        (source !== "rescue" || BigInt(parseAnimalId(desertionNo)) !== BigInt(id))) {
        throw serviceError("동물 식별자가 서로 일치하지 않습니다.", 400, "INVALID_ANIMAL_ID")
    }
    if (!await repository.findAnimal(id, source)) {
        throw serviceError("구조동물 공고를 찾을 수 없습니다.", 404, "RESCUE_ANIMAL_NOT_FOUND")
    }
    const bookmark = await repository.create(userId, id, source)
    if (!bookmark) {
        throw serviceError("이미 북마크한 공고입니다.", 409, "BOOKMARK_ALREADY_EXISTS")
    }
    return {
        bookmark_id: bookmark.id,
        source_type: bookmark.source_type,
        animal_id: bookmark.animal_id,
        desertion_no: bookmark.desertion_no,
        created_at: bookmark.created_at
    }
}

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
