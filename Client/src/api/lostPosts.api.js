import { get, put, patch, del, postForm, toQuery } from "./client.js"

// 실종 공고 ("찾고있어요")
export const getLostPosts = (params) => get(`/lost-posts${toQuery(params)}`)
export const getLostPost = (id) => get(`/lost-posts/${id}`)
export const createLostPost = (formData) => postForm("/lost-posts", formData)
export const updateLostPost = (id, data) => put(`/lost-posts/${id}`, data)
export const updateLostPostStatus = (id, status) => patch(`/lost-posts/${id}/status`, { status })
export const deleteLostPost = (id) => del(`/lost-posts/${id}`)
