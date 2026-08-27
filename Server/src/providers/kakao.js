import { config } from "../config.js"

async function requestJson(url, options) {
  const response = await fetch(url, options)
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`Kakao OAuth 요청 실패: ${body.error ?? response.status}`)
  return body
}

export function createKakaoAuthorizeUrl(state) {
  const url = new URL("https://kauth.kakao.com/oauth/authorize")
  url.search = new URLSearchParams({
    client_id: config.oauth.kakao.restApiKey,
    redirect_uri: config.oauth.kakao.callbackUrl,
    response_type: "code",
    state,
  }).toString()
  return url.toString()
}

export async function getKakaoProfile(code) {
  const tokenParams = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.oauth.kakao.restApiKey,
    redirect_uri: config.oauth.kakao.callbackUrl,
    code,
  })

  if (config.oauth.kakao.clientSecret) {
    tokenParams.set("client_secret", config.oauth.kakao.clientSecret)
  }

  const tokenData = await requestJson("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenParams,
  })
  const profile = await requestJson("https://kapi.kakao.com/v2/user/me", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  const email = profile.kakao_account?.email
  if (!profile.id || !email) throw new Error("Kakao에서 이메일을 받지 못했습니다.")

  return {
    providerUserId: profile.id,
    email,
    name: profile.properties?.nickname || email.split("@")[0],
  }
}