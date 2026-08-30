import * as repository from "./found-posts.repository.js"
import { removeFoundImageFiles } from "./found-posts.upload.js"

// 발견제보는 AI 매칭 대상이 아니다.
// 연락처 관련 기능도 없다.

function serviceError(message, status, code) {
    const error = new Error(message)

    error.status = status
    error.code = code

    return error
}

// PostgreSQL DATE → API 명세의 YYYY-MM-DD
function formatDateOnly(value) {
    if (value === null || value === undefined) {
        return null
    }

    if (typeof value === "string") {
        return value.slice(0, 10)
    }

    if (value instanceof Date) {
        return value.toISOString().slice(0, 10)
    }

    return String(value).slice(0, 10)
}

function requiredText(value, fieldName) {
    const text = typeof value === "string" ? value.trim() : ""

    if (!text) {
        throw serviceError(
            `${fieldName}은(는) 필수입니다.`,
            400,
            "MISSING_FIELD"
        )
    }

    return text
}

function optionalText(value) {
    if (value === undefined || value === null) {
        return null
    }

    const text = String(value).trim()

    return text || null
}

function assertMaxLength(value, maxLength, fieldName) {
    if (value && value.length > maxLength) {
        throw serviceError(
            `${fieldName}은(는) ${maxLength}자 이하로 입력해주세요.`,
            400,
            "INVALID_FIELD"
        )
    }
}

function validateChoice(value, allowed, fieldName) {
    if (value && !allowed.includes(value)) {
        throw serviceError(
            `${fieldName} 값이 올바르지 않습니다.`,
            400,
            "INVALID_FIELD"
        )
    }
}

function validateDate(value, fieldName) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        throw serviceError(
            `${fieldName}는 YYYY-MM-DD 형식이어야 합니다.`,
            400,
            "INVALID_DATE"
        )
    }

    const date = new Date(`${value}T00:00:00Z`)

    if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value
    ) {
        throw serviceError(
            `${fieldName}가 올바른 날짜가 아닙니다.`,
            400,
            "INVALID_DATE"
        )
    }
}

function parsePagingValue(value, defaultValue, fieldName, maxValue) {
    if (value === undefined || value === "") {
        return defaultValue
    }

    const number = Number(value)

    if (
        !Number.isInteger(number) ||
        number <= 0 ||
        number > maxValue
    ) {
        throw serviceError(
            `${fieldName} 값이 올바르지 않습니다.`,
            400,
            "INVALID_PAGINATION"
        )
    }

    return number
}

function parsePostId(postId) {
    const id = Number(postId)

    if (!Number.isInteger(id) || id <= 0) {
        throw serviceError(
            "게시글 ID가 올바르지 않습니다.",
            400,
            "INVALID_POST_ID"
        )
    }

    return id
}

// color=갈색&color=흰색
// color=갈색,흰색
// 둘 다 처리
function parseColors(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return []
    }

    const values = Array.isArray(value) ? value : [value]

    return values
        .flatMap((item) => String(item).split(","))
        .map((item) => item.trim())
        .filter(Boolean)
}

// 이미지 삭제 URL 배열 파싱
function parseDeleteImageUrls(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return []
    }

    try {
        const parsed = typeof value === "string"
            ? JSON.parse(value)
            : value

        if (!Array.isArray(parsed)) {
            throw new Error()
        }

        return [
            ...new Set(
                parsed
                    .map((url) => String(url).trim())
                    .filter(Boolean)
            )
        ]
    } catch {
        throw serviceError(
            "delete_image_urls는 JSON 배열 형식이어야 합니다.",
            400,
            "INVALID_DELETE_IMAGES"
        )
    }
}

// 등록 필드 검증
function validateCreateFields(body) {
    const title = requiredText(body.title, "title")
    const species = requiredText(body.species, "species")
    const region = requiredText(body.region, "region")
    const findDate = requiredText(body.find_date, "find_date")

    const breed = optionalText(body.breed)
    const color = optionalText(body.color)
    const description = optionalText(body.description)

    validateChoice(species, ["개", "고양이"], "species")
    validateDate(findDate, "find_date")

    assertMaxLength(title, 100, "title")
    assertMaxLength(species, 20, "species")
    assertMaxLength(breed, 50, "breed")
    assertMaxLength(color, 30, "color")
    assertMaxLength(region, 100, "region")

    return {
        title,
        species,
        breed,
        color,
        region,
        findDate,
        description
    }
}

// 4.1 발견제보 등록
export async function createPost({ userId, body, imageUrls = [] }) {
    if (!Array.isArray(imageUrls)) {
        throw serviceError(
            "이미지 정보가 올바르지 않습니다.",
            422,
            "IMAGE_PROCESSING_FAILED"
        )
    }

    if (imageUrls.length > 3) {
        throw serviceError(
            "이미지는 최대 3장까지 등록할 수 있습니다.",
            400,
            "TOO_MANY_IMAGES"
        )
    }

    const post = validateCreateFields(body)

    const result = await repository.createPostWithImages({
        userId,
        post,
        imageUrls
    })

    const createdPost = result.post

    // API 명세 Response 201과 필드 정확히 맞춤
    return {
        id: createdPost.id,
        title: createdPost.title,
        images: result.images.map((image) => image.image_url),
        species: createdPost.species,
        breed: createdPost.breed,
        color: createdPost.color,
        region: createdPost.region,
        find_date: formatDateOnly(createdPost.find_date),
        status: createdPost.status,
        created_at: createdPost.created_at
    }
}

// 4.2 발견제보 목록 조회
export async function getPosts(query) {
    const page = parsePagingValue(
        query.page,
        1,
        "page",
        Number.MAX_SAFE_INTEGER
    )

    const size = parsePagingValue(
        query.size,
        20,
        "size",
        100
    )

    const species = optionalText(query.species)
    const breed = optionalText(query.breed)
    const colors = parseColors(query.color)
    const region = optionalText(query.region)
    const startDate = optionalText(query.start_date)
    const endDate = optionalText(query.end_date)
    const status = optionalText(query.status) ?? "active"
    const sort = optionalText(query.sort) ?? "latest"

    validateChoice(species, ["개", "고양이"], "species")
    validateChoice(status, ["active", "blind"], "status")
    validateChoice(sort, ["latest"], "sort")

    if (startDate) {
        validateDate(startDate, "start_date")
    }

    if (endDate) {
        validateDate(endDate, "end_date")
    }

    if (
        startDate &&
        endDate &&
        startDate > endDate
    ) {
        throw serviceError(
            "start_date는 end_date보다 늦을 수 없습니다.",
            400,
            "INVALID_DATE_RANGE"
        )
    }

    const offset = (page - 1) * size

    const { items, total } = await repository.findMany({
        filters: {
            species,
            breed,
            colors,
            region,
            startDate,
            endDate,
            status
        },
        size,
        offset
    })

    // API 명세 Response 200 구조
    return {
        total,
        page,
        size,
        items: items.map((item, index) => ({
            id: item.id,
            no: total - offset - index,
            title: item.title,
            region: item.region,
            created_at: item.created_at
        }))
    }
}

// 4.3 발견제보 상세 조회
export async function getPost({ postId, userId }) {
    const id = parsePostId(postId)
    const post = await repository.findById(id)

    if (!post) {
        throw serviceError(
            "발견제보 게시글을 찾을 수 없습니다.",
            404,
            "FOUND_POST_NOT_FOUND"
        )
    }

    // API 명세 상세 Response 구조
    return {
        id: post.id,
        title: post.title,
        images: post.imageRows.map((image) => image.image_url),
        species: post.species,
        breed: post.breed,
        color: post.color,
        region: post.region,
        find_date: formatDateOnly(post.find_date),
        description: post.description,
        is_owner:
            userId != null &&
            String(userId) === String(post.user_id),
        author: {
            name: post.author_name
        },
        created_at: post.created_at
    }
}

// 4.4 발견제보 수정
export async function updatePost({
    postId,
    userId,
    body,
    imageUrls = []
}) {
    const id = parsePostId(postId)
    const owner = await repository.findOwnerById(id)

    if (!owner) {
        throw serviceError(
            "발견제보 게시글을 찾을 수 없습니다.",
            404,
            "FOUND_POST_NOT_FOUND"
        )
    }

    if (String(owner.user_id) !== String(userId)) {
        throw serviceError(
            "작성자 본인만 수정할 수 있습니다.",
            403,
            "FORBIDDEN"
        )
    }

    const fields = {}

    if (Object.hasOwn(body, "title")) {
        fields.title = requiredText(body.title, "title")
        assertMaxLength(fields.title, 100, "title")
    }

    if (Object.hasOwn(body, "species")) {
        fields.species = requiredText(body.species, "species")
        validateChoice(fields.species, ["개", "고양이"], "species")
    }

    if (Object.hasOwn(body, "breed")) {
        fields.breed = optionalText(body.breed)
        assertMaxLength(fields.breed, 50, "breed")
    }

    if (Object.hasOwn(body, "color")) {
        fields.color = optionalText(body.color)
        assertMaxLength(fields.color, 30, "color")
    }

    if (Object.hasOwn(body, "region")) {
        fields.region = requiredText(body.region, "region")
        assertMaxLength(fields.region, 100, "region")
    }

    if (Object.hasOwn(body, "find_date")) {
        fields.findDate = requiredText(body.find_date, "find_date")
        validateDate(fields.findDate, "find_date")
    }

    if (Object.hasOwn(body, "description")) {
        fields.description = optionalText(body.description)
    }

    const deleteImageUrls = parseDeleteImageUrls(body.delete_image_urls)

    const currentImages = await repository.findImagesByPostId(id)

    const currentUrlSet = new Set(
        currentImages.map((image) => image.image_url)
    )

    // 다른 게시글 이미지는 삭제 불가
    for (const imageUrl of deleteImageUrls) {
        if (!currentUrlSet.has(imageUrl)) {
            throw serviceError(
                "삭제할 이미지가 현재 게시글에 속하지 않습니다.",
                400,
                "INVALID_DELETE_IMAGE"
            )
        }
    }

    const finalImageCount =
        currentImages.length -
        deleteImageUrls.length +
        imageUrls.length

    if (finalImageCount > 3) {
        throw serviceError(
            "이미지는 최대 3장까지 등록할 수 있습니다.",
            400,
            "TOO_MANY_IMAGES"
        )
    }

    const hasFieldUpdate = Object.keys(fields).length > 0

    const hasImageUpdate =
        deleteImageUrls.length > 0 ||
        imageUrls.length > 0

    if (!hasFieldUpdate && !hasImageUpdate) {
        throw serviceError(
            "수정할 값을 하나 이상 입력해주세요.",
            400,
            "MISSING_UPDATE_FIELD"
        )
    }

    const result = await repository.updatePostWithImages({
        id,
        fields,
        deleteImageUrls,
        newImageUrls: imageUrls
    })

    try {
        // DB 삭제 성공 후 실제 로컬 파일 삭제
        await removeFoundImageFiles(
            result.deletedImages.map((image) => image.image_url)
        )

        return await getPost({
            postId: id,
            userId
        })
    } catch (error) {
        error.dbCommitted = true
        throw error
    }
}

// 4.4 발견제보 삭제
export async function deletePost({ postId, userId }) {
    const id = parsePostId(postId)
    const owner = await repository.findOwnerById(id)

    if (!owner) {
        throw serviceError(
            "발견제보 게시글을 찾을 수 없습니다.",
            404,
            "FOUND_POST_NOT_FOUND"
        )
    }

    if (String(owner.user_id) !== String(userId)) {
        throw serviceError(
            "작성자 본인만 삭제할 수 있습니다.",
            403,
            "FORBIDDEN"
        )
    }

    const result = await repository.remove(id)

    await removeFoundImageFiles(result.imageUrls)

    return null
}
