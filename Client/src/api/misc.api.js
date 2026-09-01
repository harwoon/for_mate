import { get, post, put, del, toQuery } from "./client.js"

// 북마크
export const getBookmarks = () => get("/bookmarks")
export const addBookmark = (desertionNo) => post("/bookmarks", { desertion_no: desertionNo })
export const removeBookmark = (bookmarkId) => del(`/bookmarks/${bookmarkId}`)

// 마이페이지
export const getMyLostPosts = (params) => get(`/my/lost-posts${toQuery(params)}`)
export const getMyFoundPosts = (params) => get(`/my/found-posts${toQuery(params)}`)

// 알림
export const getNotifications = () => get("/notifications")
export const readNotification = (id) => put(`/notifications/${id}/read`)

// 신고
export const createReport = (data) => post("/reports", data)

// 고객센터 문의
export const createInquiry = (data) => post("/inquiries", data)
export const getInquiries = () => get("/inquiries")
export const getInquiry = (id) => get(`/inquiries/${id}`)
