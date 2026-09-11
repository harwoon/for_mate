// Server 폴더에서 실행:
// node --env-file=.env tests/matches-contract.integration.mjs

// 테스트용 쿼리는 현재 세션에서만 사용하는 임시 테이블을 사용하며,
// 테스트가 끝나면 모든 fixture 데이터는 롤백된다.
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { pool } from "../src/db/pool.js"
import * as matches from "../src/modules/matches/matches.service.js"
import {
    getMatches as getMatchesController
} from "../src/modules/matches/matches.controller.js"
import { findAllMatches } from "../src/modules/admin/admin.repository.js"
import {
    findSummary,
    findMyLostPosts
} from "../src/modules/my/my.repository.js"
import {
    getPost,
    getPosts,
    createPost
} from "../src/modules/lost-posts/lost-posts.service.js"

const client =
    await pool.connect()

const originalQuery =
    pool.query

const originalConnect =
    pool.connect

const originalFetch =
    globalThis.fetch

let queue =
    Promise.resolve()

const checks = []

pool.query = (...args) => {
    const next =
        queue.then(() =>
            client.query(
                ...args
            )
        )

    queue =
        next.catch(
            () => {}
        )

    return next
}

const vector = (angle) =>
    JSON.stringify([
        Math.cos(angle),
        Math.sin(angle),
        ...Array(
            1022
        ).fill(0)
    ])

async function check(
    name,
    run
) {
    await run()

    checks.push(name)

    console.log(
        `PASS: ${name}`
    )
}

async function expectError(
    id,
    userId,
    status,
    code,
    limit
) {
    await assert.rejects(
        matches.getMatches(
            id,
            userId,
            limit
        ),
        (error) =>
            error.status ===
                status &&
            error.code ===
                code
    )
}

try {
    await client.query(
        "BEGIN"
    )

    await client.query(
        "SET LOCAL statement_timeout = '30s'"
    )

    const schema =
        await readFile(
            new URL(
                "../src/db/schema.sql",
                import.meta.url
            ),
            "utf8"
        )

    await client.query(
        schema.replaceAll(
            "CREATE TABLE ",
            "CREATE TEMP TABLE "
        )
    )

    for (
        const table of [
            "users",
            "reports",
            "lost_posts",
            "images",
            "embeddings",
            "matches",
            "rescue_animals",
            "pawinhand_animals"
        ]
    ) {
        assert.equal(
            (
                await client.query(
                    "SELECT relpersistence FROM pg_class WHERE oid = to_regclass($1)",
                    [table]
                )
            ).rows[0]
                .relpersistence,
            "t"
        )
    }

    await client.query(
        `
            INSERT INTO users(
                id,
                name,
                email
            )
            VALUES
                (
                    101,
                    'Owner',
                    'owner@example.invalid'
                ),
                (
                    102,
                    'Other',
                    'other@example.invalid'
                )
        `
    )

    await client.query(
        `
            INSERT INTO lost_posts(
                id,
                user_id,
                pet_name,
                species,
                region,
                event_date
            )
            VALUES
                (
                    101,
                    101,
                    'Pet',
                    'dog',
                    'Region',
                    CURRENT_DATE
                ),
                (
                    102,
                    101,
                    'Pending',
                    'dog',
                    'Region',
                    CURRENT_DATE
                )
        `
    )

    await check(
        "ownership and existence are checked before embeddings",
        async () => {
            await expectError(
                999,
                "101",
                404,
                "LOST_POST_NOT_FOUND"
            )

            await expectError(
                101,
                "102",
                403,
                "FORBIDDEN"
            )

            await expectError(
                101,
                undefined,
                403,
                "FORBIDDEN"
            )

            await expectError(
                101,
                "101",
                409,
                "EMBEDDINGS_NOT_READY"
            )

            await expectError(
                0,
                "101",
                400,
                "INVALID_POST_ID"
            )

            await expectError(
                101,
                "101",
                400,
                "INVALID_LIMIT",
                51
            )

            assert.equal(
                (
                    await client.query(
                        "SELECT COUNT(*)::int AS n FROM matches"
                    )
                ).rows[0].n,
                0
            )
        }
    )

    for (
        const angle of [
            0,
            0.15
        ]
    ) {
        const { rows } =
            await client.query(
                `
                    INSERT INTO images(
                        post_type,
                        lost_post_id,
                        image_url
                    )
                    VALUES(
                        'lost',
                        101,
                        '/uploads/lost.jpg'
                    )
                    RETURNING id
                `
            )

        await client.query(
            `
                INSERT INTO embeddings(
                    image_id,
                    embedding,
                    model_version
                )
                VALUES(
                    $1,
                    $2::vector,
                    'test'
                )
            `,
            [
                rows[0].id,
                vector(angle)
            ]
        )
    }

    await check(
        "ready embeddings with no candidates return an empty result",
        async () => {
            assert.deepEqual(
                await matches.getMatches(
                    101,
                    "101"
                ),
                {
                    items: [],
                    limit: 10,
                    max_limit: 50,
                    has_more: false
                }
            )
        }
    )

    const expected = []

    for (
        const source of [
            "rescue",
            "pawinhand"
        ]
    ) {
        for (
            let id = 1;
            id <= 12;
            id += 1
        ) {
            const angle =
                0.18 +
                id *
                    0.025 +
                (
                    source ===
                    "pawinhand"
                        ? 0.01
                        : 0
                )

            if (
                source ===
                "rescue"
            ) {
                await client.query(
                    `
                        INSERT INTO rescue_animals(
                            desertion_no,
                            up_kind_nm,
                            kind_nm,
                            color_cd,
                            color_tags,
                            sex_cd,
                            happen_place,
                            happen_dt
                        )
                        VALUES(
                            $1,
                            'dog',
                            'breed',
                            'brown',
                            ARRAY['brown'],
                            'M',
                            'place',
                            DATE '2026-09-01'
                        )
                    `,
                    [id]
                )
            } else {
                await client.query(
                    `
                        INSERT INTO pawinhand_animals(
                            id,
                            source_id,
                            detail_url,
                            up_kind_nm,
                            kind_nm,
                            color_cd,
                            color_tags,
                            sex_cd,
                            happen_place,
                            happen_dt
                        )
                        VALUES(
                            $1,
                            $2,
                            'https://example.invalid',
                            'dog',
                            'breed',
                            'brown',
                            ARRAY['brown'],
                            'M',
                            'place',
                            DATE '2026-09-01'
                        )
                    `,
                    [
                        id,
                        `source-${id}`
                    ]
                )
            }

            const column =
                source ===
                "rescue"
                    ? "desertion_no"
                    : "pawinhand_animal_id"

            for (
                const photoAngle of [
                    angle,
                    angle + 0.1
                ]
            ) {
                const { rows } =
                    await client.query(
                        `
                            INSERT INTO images(
                                post_type,
                                ${column},
                                image_url
                            )
                            VALUES(
                                $1,
                                $2,
                                $3
                            )
                            RETURNING id
                        `,
                        [
                            source,
                            id,
                            `/uploads/${source}-${id}.jpg`
                        ]
                    )

                await client.query(
                    `
                        INSERT INTO embeddings(
                            image_id,
                            embedding,
                            model_version
                        )
                        VALUES(
                            $1,
                            $2::vector,
                            'test'
                        )
                    `,
                    [
                        rows[0].id,
                        vector(
                            photoAngle
                        )
                    ]
                )
            }

            expected.push({
                source_type:
                    source,
                id,
                similarity:
                    Math.cos(
                        angle -
                            0.15
                    )
            })
        }
    }

    expected.sort(
        (a, b) =>
            b.similarity -
            a.similarity
    )

    let first

    await check(
        "controller returns top 10 and load-more metadata",
        async () => {
            let response

            await getMatchesController(
                {
                    params: {
                        id: "101"
                    },
                    query: {},
                    userId: "101"
                },
                {
                    json: (body) => {
                        response = body
                    }
                },
                (error) => {
                    throw error
                }
            )

            assert.equal(
                response.success,
                true
            )

            assert.equal(
                response.data.limit,
                10
            )

            assert.equal(
                response.data.max_limit,
                50
            )

            assert.equal(
                response.data.has_more,
                true
            )

            first =
                response.data.items

            assert.equal(
                first.length,
                10
            )

            for (
                const [
                    index,
                    item
                ] of first.entries()
            ) {
                const target =
                    expected[index]

                assert.equal(
                    item.rank,
                    index + 1
                )

                assert.equal(
                    item.source_type,
                    target.source_type
                )

                assert.equal(
                    item.animal_id,
                    String(
                        target.id
                    )
                )

                assert.equal(
                    item.desertion_no,
                    target.source_type ===
                        "rescue"
                        ? target.id
                        : null
                )

                assert.equal(
                    item.pawinhand_animal_id,
                    target.source_type ===
                        "pawinhand"
                        ? target.id
                        : null
                )

                assert.ok(
                    Math.abs(
                        item.similarity -
                            target.similarity
                    ) <
                        0.000001
                )

                assert.equal(
                    typeof item.similarity,
                    "number"
                )

                assert.equal(
                    typeof item.match_id,
                    "string"
                )

                assert.equal(
                    item.image_url,
                    `/uploads/${target.source_type}-${target.id}.jpg`
                )

                assert.equal(
                    item.species,
                    "dog"
                )

                assert.equal(
                    item.breed,
                    "breed"
                )

                assert.equal(
                    item.color,
                    "brown"
                )

                assert.deepEqual(
                    item.color_tags,
                    ["brown"]
                )

                assert.equal(
                    item.sex,
                    "M"
                )

                assert.equal(
                    item.happen_place,
                    "place"
                )

                assert.equal(
                    item.happen_dt,
                    "2026-09-01"
                )

                assert.equal(
                    item.region_sido,
                    null
                )

                assert.equal(
                    item.region_sigungu,
                    null
                )
            }

            assert.equal(
                new Set(
                    first.map(
                        (item) =>
                            `${item.source_type}:${item.animal_id}`
                    )
                ).size,
                10
            )
        }
    )

    await check(
        "same-day default request retains top 10 IDs",
        async () => {
            const second =
                await matches.getMatches(
                    101,
                    101
                )

            assert.deepEqual(
                second.items,
                first
            )

            assert.equal(
                (
                    await client.query(
                        "SELECT COUNT(*)::int AS n FROM matches"
                    )
                ).rows[0].n,
                10
            )

            for (
                const item of first
            ) {
                const detail =
                    await matches.getMatchDetail(
                        Number(
                            item.match_id
                        ),
                        "101"
                    )

                assert.equal(
                    detail.animal.source_type,
                    item.source_type
                )

                assert.equal(
                    detail.animal.id,
                    Number(
                        item.animal_id
                    )
                )

                assert.equal(
                    detail.comparison.length,
                    5
                )

                await assert.rejects(
                    matches.getMatchDetail(
                        Number(
                            item.match_id
                        ),
                        "102"
                    ),
                    {
                        status: 403,
                        code: "FORBIDDEN"
                    }
                )
            }

            await assert.rejects(
                matches.getMatchDetail(
                    99999,
                    "101"
                ),
                {
                    status: 404,
                    code:
                        "MATCH_NOT_FOUND"
                }
            )
        }
    )

    await check(
        "load more expands stored candidates to 20",
        async () => {
            const result =
                await matches.getMatches(
                    101,
                    101,
                    20
                )

            assert.equal(
                result.items.length,
                20
            )

            assert.equal(
                result.limit,
                20
            )

            assert.equal(
                result.max_limit,
                50
            )

            assert.equal(
                result.has_more,
                true
            )

            assert.deepEqual(
                result.items.map(
                    (item) =>
                        item.rank
                ),
                Array.from(
                    {
                        length: 20
                    },
                    (
                        _,
                        index
                    ) =>
                        index + 1
                )
            )

            assert.equal(
                (
                    await client.query(
                        "SELECT COUNT(*)::int AS n FROM matches"
                    )
                ).rows[0].n,
                20
            )
        }
    )

    await check(
        "requesting up to 50 stops when all candidates are exhausted",
        async () => {
            const result =
                await matches.getMatches(
                    101,
                    101,
                    50
                )

            assert.equal(
                result.items.length,
                24
            )

            assert.equal(
                result.limit,
                50
            )

            assert.equal(
                result.max_limit,
                50
            )

            assert.equal(
                result.has_more,
                false
            )

            assert.equal(
                (
                    await client.query(
                        "SELECT COUNT(*)::int AS n FROM matches"
                    )
                ).rows[0].n,
                24
            )
        }
    )

    await check(
        "admin, my counts and lost-post reads still work",
        async () => {
            const admin =
                await findAllMatches({
                    minSimilarity:
                        null,
                    limit: 100
                })

            assert.equal(
                admin.length,
                24
            )

            assert.deepEqual(
                new Set(
                    admin.map(
                        (item) =>
                            item.source_type
                    )
                ),
                new Set([
                    "rescue",
                    "pawinhand"
                ])
            )

            const summary =
                await findSummary(
                    "101"
                )

            assert.equal(
                summary.counts.matches,
                24
            )

            const posts =
                await findMyLostPosts({
                    userId: "101",
                    size: 20,
                    offset: 0
                })

            assert.equal(
                posts.items.find(
                    (post) =>
                        post.id ===
                        "101"
                ).match_count,
                24
            )

            assert.equal(
                (
                    await getPost({
                        postId: 101,
                        userId: "101"
                    })
                ).is_owner,
                true
            )

            assert.equal(
                (
                    await getPosts(
                        {}
                    )
                ).items.length,
                2
            )
        }
    )

    await check(
        "lost-post creation still dispatches embeddings without waiting",
        async () => {
            pool.connect =
                async () => ({
                    query: (
                        sql,
                        params
                    ) =>
                        client.query(
                            sql ===
                                "BEGIN"
                                ? "SAVEPOINT creation"
                                : sql ===
                                    "COMMIT"
                                    ? "RELEASE SAVEPOINT creation"
                                    : sql ===
                                        "ROLLBACK"
                                        ? "ROLLBACK TO SAVEPOINT creation"
                                        : sql,
                            params
                        ),
                    release() {}
                })

            let embeddingRequest

            globalThis.fetch =
                (
                    url,
                    options
                ) => {
                    embeddingRequest =
                        JSON.parse(
                            options.body
                        )

                    return new Promise(
                        () => {}
                    )
                }

            const created =
                await createPost({
                    userId: "101",
                    body: {
                        pet_name:
                            "Pet",
                        species:
                            "개",
                        region:
                            "Region",
                        event_date:
                            "2026-09-01"
                    },
                    imageUrls: [
                        "/uploads/a.jpg",
                        "/uploads/b.jpg",
                        "/uploads/c.jpg"
                    ]
                })

            assert.equal(
                created.images.length,
                3
            )

            assert.equal(
                embeddingRequest
                    .images.length,
                3
            )

            await expectError(
                Number(
                    created.id
                ),
                "101",
                409,
                "EMBEDDINGS_NOT_READY"
            )
        }
    )

    console.log(
        `${checks.length} checks passed`
    )
} finally {
    globalThis.fetch =
        originalFetch

    pool.query =
        originalQuery

    pool.connect =
        originalConnect

    await queue

    await client.query(
        "ROLLBACK"
    )

    client.release()

    await pool.end()
}