function parseResultLimit(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return DEFAULT_RESULT_LIMIT
    }

    const limit = Number(value)

    if (
        !Number.isInteger(limit) ||
        limit <= 0 ||
        limit > MAX_RESULT_LIMIT
    ) {
        const error = new Error(
            `limit은 1 이상 ${MAX_RESULT_LIMIT} 이하의 정수여야 합니다.`
        )

        error.status = 400
        error.code = "INVALID_LIMIT"

        throw error
    }

    return limit
}

// 캐시 조회가 아니라 요청마다 실시간으로 계산한다.
export async function getMatches(lostPostId, userId, rawLimit) {
    if (!Number.isInteger(lostPostId) || lostPostId <= 0) {
        throw Object.assign(
            new Error("공고 ID가 올바르지 않습니다."),
            {
                status: 400,
                code: "INVALID_POST_ID"
            }
        )
    }

    const limit = parseResultLimit(rawLimit)

    const post = await findLostPostById(lostPostId)

    if (!post) {
        throw Object.assign(
            new Error("실종 공고를 찾을 수 없습니다."),
            {
                status: 404,
                code: "LOST_POST_NOT_FOUND"
            }
        )
    }

    if (
        userId == null ||
        String(post.user_id) !== String(userId)
    ) {
        throw Object.assign(
            new Error("접근 권한이 없습니다."),
            {
                status: 403,
                code: "FORBIDDEN"
            }
        )
    }

    const vectors = await repository.findLostPostEmbeddings(
        lostPostId
    )

    if (vectors.length === 0) {
        const error = new Error(
            "이미지 임베딩이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요."
        )

        error.status = 409
        error.code = "EMBEDDINGS_NOT_READY"

        throw error
    }

    const species = await repository.findLostPostSpecies(
        lostPostId
    )

    const bestByAnimal = new Map()

    for (const vector of vectors) {
        const candidates = await repository.findNearestCandidates(
            vector,
            species,
            CANDIDATE_LIMIT_PER_VECTOR
        )

        for (const {
            ref_id,
            source_type,
            distance
        } of candidates) {
            const key = `${source_type}:${ref_id}`
            const current = bestByAnimal.get(key)

            if (
                current === undefined ||
                distance < current.distance
            ) {
                bestByAnimal.set(key, {
                    distance,
                    source_type,
                    ref_id: Number(ref_id)
                })
            }
        }
    }

    // 전체 후보를 유사도 순으로 정렬
    const rankedAll = [...bestByAnimal.values()]
        .map(({ source_type, ref_id, distance }) => ({
            source_type,
            desertion_no:
                source_type === "rescue"
                    ? ref_id
                    : null,
            pawinhand_animal_id:
                source_type === "pawinhand"
                    ? ref_id
                    : null,
            similarity: 1 - distance
        }))
        .sort(
            (a, b) =>
                b.similarity - a.similarity
        )

    // 요청한 순위까지만 사용
    const ranked = rankedAll.slice(
        0,
        limit
    )

    if (ranked.length === 0) {
        return {
            items: [],
            limit,
            max_limit: MAX_RESULT_LIMIT,
            has_more: false
        }
    }

    const savedMatches = await repository.upsertMatches(
        lostPostId,
        ranked.map((result) => ({
            source_type: result.source_type,
            ref_id:
                result.source_type === "rescue"
                    ? result.desertion_no
                    : result.pawinhand_animal_id,
            similarity: result.similarity
        }))
    )

    const candidates = await repository.findMatchCandidates(
        savedMatches.map((match) => match.id)
    )

    const candidatesById = new Map(
        candidates.map((candidate) => [
            candidate.match_id,
            candidate
        ])
    )

    const items = ranked.map((result, index) => ({
        ...candidatesById.get(savedMatches[index].id),
        match_id: savedMatches[index].id,
        ...result,
        rank: index + 1
    }))

    return {
        items,
        limit,
        max_limit: MAX_RESULT_LIMIT,
        has_more:
            limit < MAX_RESULT_LIMIT &&
            rankedAll.length > limit
    }
}