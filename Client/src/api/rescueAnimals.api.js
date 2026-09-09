import { get } from "./client.js"

// 구조동물 공고 ("보호중이에요") - 공공데이터, 조회만 가능
export const getRescueAnimals = (params = {}) => {
    const search = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
        if (
            value === undefined ||
            value === null ||
            value === ""
        ) {
            return
        }

        if (Array.isArray(value)) {
            value.forEach((item) => {
                if (item !== "") {
                    search.append(key, item)
                }
            })

            return
        }

        search.append(key, value)
    })

    const query = search.toString()

    return get(
        `/rescue-animals${query ? `?${query}` : ""}`
    )
}

export const getRescueAnimal = (desertionNo) => (
    get(`/rescue-animals/${desertionNo}`)
)

export const getAnimalBySource = (
    sourceType,
    animalId
) => (
    get(
        `/rescue-animals/${encodeURIComponent(sourceType)}/${encodeURIComponent(animalId)}`
    )
)