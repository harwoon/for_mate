import { get, toQuery } from "./client.js"

// AI 매칭 (공공데이터 구조동물 + 포인핸드 후보 조회)
export const getMatches = (lostPostId, params) =>
    get(`/lost-posts/${lostPostId}/matches${toQuery(params)}`)

export const getMatchDetail = (matchId) => get(`/matches/${matchId}`)
