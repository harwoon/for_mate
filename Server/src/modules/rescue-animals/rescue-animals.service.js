import * as repository from "./rescue-animals.repository.js"

// 공공데이터 수집 결과를 조회만 한다. 등록/수정 기능은 없다.

// 5.1 구조동물 목록 조회
export async function getAnimals(query) {
    const page = Math.max(parseInt(query.page, 10) || 1, 1)
    const size = Math.min(Math.max(parseInt(query.size, 10) || 15, 1), 100)
    const offset = (page - 1) * size

    let colors = []

    if (query.color) {
        colors = Array.isArray(query.color) ? query.color : [query.color]
        colors = colors.map(color => color.trim()).filter(Boolean)
    }

    if (query.breed) {
        const exists = await repository.existsBreed({
            species: query.species || null,
            breed: query.breed
        })

        if (!exists) {
            const error = new Error("없는 품종입니다.")
            error.status = 400
            error.code = "INVALID_BREED"
            throw error
        }
    }

    const sido = typeof query.sido === "string" ? (query.sido.trim() || null) : null
    const sigungu = typeof query.sigungu === "string" ? (query.sigungu.trim() || null) : null
    const filters = {
        species: query.species || null,
        breed: query.breed || null,
        colors,
        sido,
        sigungu: sido ? sigungu : null,
        size,
        offset
    }

    const { items, total } = await repository.findMany(filters)

    return {total, page, size, items}
}

// 5.2 구조동물 상세 조회
export async function getAnimal(desertionNo, userId) {
    if (!desertionNo) {
        return null
    }

    // 북마크 기능 사용 : userId 있어야 함
    return repository.findById(desertionNo, userId)
}