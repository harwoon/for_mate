import { del, get, patch, post } from "./client.js"

export const getComments = (postType, postId) =>
    get(`/comments/${postType}/${postId}`)

export const createComment = (postType, postId, data) =>
    post(`/comments/${postType}/${postId}`, data)

export const updateComment = (commentId, data) =>
    patch(`/comments/${commentId}`, data)

export const deleteComment = (commentId) =>
    del(`/comments/${commentId}`)
