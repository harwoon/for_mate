import * as service from "./rescue-animals.service.js"
import { ok, fail } from "../../utils/response.js"

// 5.1 구조동물 목록 조회 (필터링)
export async function getAnimals(req, res, next) {
    try {
        const result = await service.getAnimals(req.query)

        ok(res, result)

    } catch (err) {
        next(err)
    }
}

// 5.2 구조동물 상세 조회
export async function getAnimal(req, res, next) {
    try {
        const animal = await service.getAnimal(
            req.params.desertionNo,
            req.userId ?? null
        )

        if (!animal) {
            return fail(
                res,
				404,
                "RESCUE_ANIMAL_NOT_FOUND",
                "구조동물 공고를 찾을 수 없습니다."
            )
        }

        ok(res, animal)

    } catch (err) {
        next(err)
    }
}