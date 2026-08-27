import { config } from "../config.js"

async function requestJson(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Google OAuth 요청 실패: ${body.error ?? response.status}`)
  return body
}

export function createGoogleAuthorizeUrl(state) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth")
  url.search = new URLSearchParams({
    client_id: config.oauth.google.clientId,
    redirect_uri: config.oauth.google.callbackUrl,
    response_type: "code",
    scope: "openid email profile",
    state,
  }).toString()
  return url.toString()
}

export async function getGoogleProfile(code) {
  const tokenData = await requestJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.oauth.google.clientId,
      client_secret: config.oauth.google.clientSecret,
      redirect_uri: config.oauth.google.callbackUrl,
      grant_type: "authorization_code",
    }),
  })

  const profile = await requestJson("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  if (!profile.sub || !profile.email || profile.email_verified !== true) {
    throw new Error("Google에서 인증된 이메일을 받지 못했습니다.")
  }

  return {
    providerUserId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email.split("@")[0],
  }
}