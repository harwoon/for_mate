export function validateSourceType(sourceType) {
    if (!["rescue", "pawinhand"].includes(sourceType)) {
        throw Object.assign(new Error("지원하지 않는 동물 출처입니다."), {
            status: 400, code: "INVALID_SOURCE_TYPE"
        })
    }
    return sourceType
}

export function parseAnimalId(value, code = "INVALID_ANIMAL_ID") {
    const id = String(value ?? "").trim()
    if ((typeof value === "number" && !Number.isSafeInteger(value)) ||
        !/^\d+$/.test(id) || BigInt(id) > 9223372036854775807n) {
        throw Object.assign(new Error("동물 ID가 올바르지 않습니다."), { status: 400, code })
    }
    return id
}

// Keep every source record; numeric IDs remain BIGINT until serialized as text.
const columns = `happen_dt, happen_place, up_kind_nm, kind_nm, color_cd,
    color_tags, age, weight, process_state, sex_cd, neuter_yn, special_mark,
    care_nm, care_tel, care_addr, region_sido, region_sigungu, notice_sdt, notice_edt`

export const animalsSql = `
    SELECT 'rescue'::text AS source_type, desertion_no AS animal_id,
        desertion_no, NULL::bigint AS pawinhand_animal_id,
        NULL::text AS source_id, NULL::text AS notice_no, NULL::text AS detail_url, ${columns}
    FROM rescue_animals
    UNION ALL
    SELECT 'pawinhand'::text, id, NULL::bigint, id,
        source_id, notice_no, detail_url, ${columns}
    FROM pawinhand_animals
    WHERE duplicate_of_desertion_no IS NULL
`

export const animalImageCondition = `i.post_type = r.source_type AND (
    (r.source_type = 'rescue' AND i.desertion_no = r.animal_id) OR
    (r.source_type = 'pawinhand' AND i.pawinhand_animal_id = r.animal_id))`
