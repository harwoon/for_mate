import { config } from "../../config.js"
import * as googleProvider from "../../providers/google.js"
import * as kakaoProvider from "../../providers/kakao.js"
import {
  clearAuthCookies,
  createOAuthStateCookie,
  getCookie,
  setAuthCookies,
  validateOAuthStateCookie,
} from "../../utils/cookie.js"
import { ok, created, fail } from "../../utils/response.js"
import * as service from "./auth.service.js"

export async function signup(req, res, next) {
  try {
    const user = await service.signup(req.body)
    created(res, user)
  } catch (err) {
    next(err)
  }
}

export async function login(req, res, next) {
  try {
    const session = await service.login(req.body)
    setAuthCookies(res, session)
    ok(res, { user: session.user })
  } catch (err) {
    next(err)
  }
}

export async function getMe(req, res, next) {
  try {
    ok(res, { user: service.toPublicUser(req.user) })
  } catch (err) {
    next(err)
  }
}

export async function refresh(req, res, next) {
  try {
    const session = await service.refreshSession(getCookie(req, "refresh_token"))
    setAuthCookies(res, session)
    res.sendStatus(204)
  } catch (err) {
    clearAuthCookies(res)
    next(err)
  }
}

export function logout(req, res) {
  clearAuthCookies(res)
  res.sendStatus(204)
}

export function startGoogleLogin(req, res) {
  res.set("Cache-Control", "no-store")
  const state = createOAuthStateCookie(res)
  res.redirect(googleProvider.createGoogleAuthorizeUrl(state))
}

export async function googleCallback(req, res, next) {
  try {
    res.set("Cache-Control", "no-store")
    if (req.query.error) return fail(res, 400, "OAUTH_CANCELLED", "Google 로그인이 취소되었습니다.")
    if (!req.query.code || !validateOAuthStateCookie(req, res)) {
      return fail(res, 400, "INVALID_OAUTH_REQUEST", "유효하지 않은 OAuth 요청입니다.")
    }
    const profile = await googleProvider.getGoogleProfile(req.query.code)
    const session = await service.loginWithOAuth({ provider: "GOOGLE", ...profile })
    setAuthCookies(res, session)
    res.redirect(config.frontendUrl)
  } catch (err) {
    next(err)
  }
}

export function startKakaoLogin(req, res) {
  res.set("Cache-Control", "no-store")
  const state = createOAuthStateCookie(res)
  res.redirect(kakaoProvider.createKakaoAuthorizeUrl(state))
}

export async function kakaoCallback(req, res, next) {
  try {
    res.set("Cache-Control", "no-store")
    if (req.query.error) return fail(res, 400, "OAUTH_CANCELLED", "Kakao 로그인이 취소되었습니다.")
    if (!req.query.code || !validateOAuthStateCookie(req, res)) {
      return fail(res, 400, "INVALID_OAUTH_REQUEST", "유효하지 않은 OAuth 요청입니다.")
    }
    const profile = await kakaoProvider.getKakaoProfile(req.query.code)
    const session = await service.loginWithOAuth({ provider: "KAKAO", ...profile })
    setAuthCookies(res, session)
    res.redirect(config.frontendUrl)
  } catch (err) {
    next(err)
  }
}