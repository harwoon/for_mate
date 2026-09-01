import { get, toQuery } from "./client.js"

// 구조동물 공고 ("보호중이에요") - 공공데이터, 조회만 가능
export const getRescueAnimals = (params) => get(`/rescue-animals${toQuery(params)}`)
export const getRescueAnimal = (desertionNo) => get(`/rescue-animals/${desertionNo}`)
