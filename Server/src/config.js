function required(key, defaultValue) {
  const value = process.env[key] || defaultValue
  if (value == null) throw new Error(`환경 변수 ${key}가 설정되지 않았습니다.`)
  return value
}

const jwtSecret = required("JWT_SECRET")
if (jwtSecret.length < 32) {
  throw new Error("JWT_SECRET은 최소 32자 이상의 랜덤 문자열이어야 합니다.")
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  frontendUrl: required("FRONTEND_URL", "http://localhost:5173"),
  jwt: {
    secretKey: jwtSecret,
    expiresInSec: Number(required("JWT_EXPIRES_SEC", "900")),
    refreshExpiresInDays: Number(required("REFRESH_TOKEN_EXPIRES_DAYS", "14")),
  },
  bcrypt: {
    saltRounds: Number(required("BCRYPT_SALT_ROUNDS", "10")),
  },
  oauth: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      callbackUrl: process.env.GOOGLE_CALLBACK_URL ?? "",
    },
    kakao: {
      restApiKey: process.env.KAKAO_REST_API_KEY ?? "",
      clientSecret: process.env.KAKAO_CLIENT_SECRET ?? "",
      callbackUrl: process.env.KAKAO_CALLBACK_URL ?? "",
    },
  },
  cookie: {
    secure: process.env.NODE_ENV === "production",
  },
}