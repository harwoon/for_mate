import { pool } from "../db/pool.js"


const DUPLICATE_THRESHOLD = 0.97


// 아직 중복 확인을 안 한 포인핸드 동물들을 대상으로,
// 동일한 임베딩 공간의 rescue 동물과 비교한다.
export async function markDuplicatePawinhandAnimals() {
    const client = await pool.connect()

    try {
        const { rows: candidates } = await client.query(
            `
            SELECT
                pa.id AS pawinhand_animal_id,
                e.embedding::text AS embedding,
                e.embedding_space_id,
                pa.up_kind_nm AS species

            FROM pawinhand_animals pa

            JOIN images i
                ON i.pawinhand_animal_id = pa.id
                AND i.post_type = 'pawinhand'

            JOIN embeddings e
                ON e.image_id = i.id

            JOIN embedding_spaces es
                ON es.id = e.embedding_space_id

            JOIN model_versions mv
                ON mv.id = es.model_version_id

            WHERE pa.duplicate_of_desertion_no IS NULL
                AND mv.is_active = TRUE
                AND es.is_usable = TRUE
                AND es.species = pa.up_kind_nm
            `
        )

        // 같은 포인핸드 개체에 사진이 여러 장 있을 수 있으므로
        // 개체별 최고 유사도 rescue 후보 하나만 유지한다.
        const bestByAnimal = new Map()

        for (const {
            pawinhand_animal_id,
            embedding,
            embedding_space_id,
            species
        } of candidates) {
            const { rows: nearest } = await client.query(
                `
                SELECT
                    ra.desertion_no,
                    (
                        e.embedding <=>
                        $1::vector
                    ) AS distance

                FROM embeddings e

                JOIN images i
                    ON i.id = e.image_id
                    AND i.post_type = 'rescue'

                JOIN rescue_animals ra
                    ON ra.desertion_no = i.desertion_no

                WHERE e.embedding_space_id = $2
                    AND ra.up_kind_nm = $3

                ORDER BY
                    e.embedding <=> $1::vector

                LIMIT 1
                `,
                [
                    embedding,
                    embedding_space_id,
                    species
                ]
            )

            if (nearest.length === 0) {
                continue
            }

            const similarity =
                1 - nearest[0].distance

            const current =
                bestByAnimal.get(
                    pawinhand_animal_id
                )

            if (
                !current ||
                similarity > current.similarity
            ) {
                bestByAnimal.set(
                    pawinhand_animal_id,
                    {
                        desertionNo:
                            nearest[0].desertion_no,
                        similarity
                    }
                )
            }
        }

        let markedCount = 0

        for (const [
            pawinhandAnimalId,
            {
                desertionNo,
                similarity
            }
        ] of bestByAnimal.entries()) {
            if (
                similarity <
                DUPLICATE_THRESHOLD
            ) {
                continue
            }

            const result = await client.query(
                `
                UPDATE pawinhand_animals
                SET duplicate_of_desertion_no = $1
                WHERE id = $2
                    AND duplicate_of_desertion_no IS NULL
                RETURNING id
                `,
                [
                    desertionNo,
                    pawinhandAnimalId
                ]
            )

            if (result.rowCount > 0) {
                markedCount += 1
            }
        }

        console.log(
            `[pawinhand] 중복 개체 표시: ${markedCount}건`
        )
    } finally {
        client.release()
    }
}