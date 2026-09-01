import { get, toQuery } from "./client.js"

// 품종 자동완성 / 색상 태그 / 지역 목록
export const getBreeds = (params) => get(`/breeds${toQuery(params)}`)
export const getColorTags = () => get("/color-tags")
export const getRegions = (params) => get(`/regions${toQuery(params)}`)
