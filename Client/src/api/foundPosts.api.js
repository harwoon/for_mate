import { get, put, del, postForm, toQuery } from "./client.js"

// 발견제보 (게시판 형식, AI 매칭 대상 아님)
export const getFoundPosts = (params) => get(`/found-posts${toQuery(params)}`)
export const getFoundPost = (id) => get(`/found-posts/${id}`)
export const createFoundPost = (formData) => postForm("/found-posts", formData)
export const updateFoundPost = (id, data) => put(`/found-posts/${id}`, data)
export const deleteFoundPost = (id) => del(`/found-posts/${id}`)
