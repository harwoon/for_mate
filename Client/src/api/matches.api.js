import { get, post, toQuery } from "./client.js"

// AI 매칭 (매칭 대상은 구조동물 공고로 한정)
export const getMatches = (lostPostId, params) =>
  get(`/lost-posts/${lostPostId}/matches${toQuery(params)}`)

export const getMatchDetail = (matchId) => get(`/matches/${matchId}`)

export const refreshMatches = (lostPostId) =>
  post(`/lost-posts/${lostPostId}/matches/refresh`)
