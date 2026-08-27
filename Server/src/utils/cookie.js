import crypto from "node:crypto"
import { config } from "../config.js"

export function getCookie(req, name) {
  const cookieHeader = req.headers.cookie
  if (!cookieHeader) return undefined

  const cookie = cookieHeader
    .split(";")
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))

  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined
}

export function createOAuthStateCookie(res) {
  const state = crypto.randomBytes(32).toString("hex")
  res.cookie("oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: "/auth",
    maxAge: 10 * 60 * 1000,
  })
  return state
}

export function validateOAuthStateCookie(req, res) {
  const stateFromCookie = getCookie(req, "oauth_state")
  res.clearCookie("oauth_state", { path: "/auth" })
  return Boolean(stateFromCookie) && stateFromCookie === req.query.state
}

export function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie("access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: "/",
    maxAge: config.jwt.expiresInSec * 1000,
  })
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookie.secure,
    path: "/auth",
    maxAge: config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000,
  })
}

export function clearAuthCookies(res) {
  res.clearCookie("access_token", { path: "/" })
  res.clearCookie("refresh_token", { path: "/auth" })
}