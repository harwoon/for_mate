import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"
import * as repository from "./auth.repository.js"

// 회원가입
export async function signup({ name, email, password }) {
  const existing = await repository.findByEmail(email)

  if (existing) {
    const err = new Error("이미 가입된 이메일입니다.")
    err.status = 409
    err.code = "DUPLICATE_EMAIL"
    throw err
  }

  const hashed = await bcrypt.hash(password, 10)
  const user = await repository.create({ name, email, password: hashed })

  return { id: user.id, email: user.email }
}

// 로그인
export async function login({ email, password }) {
  const user = await repository.findByEmail(email)

  if (!user) {
    const err = new Error("이메일 또는 비밀번호가 올바르지 않습니다.")
    err.status = 401
    err.code = "LOGIN_FAILED"
    throw err
  }

  const matched = await bcrypt.compare(password, user.password)

  if (!matched) {
    const err = new Error("이메일 또는 비밀번호가 올바르지 않습니다.")
    err.status = 401
    err.code = "LOGIN_FAILED"
    throw err
  }

  // 최종 접속일 갱신 (휴면 계정 판별에 사용)
  await repository.updateLastLogin(user.id)

  const accessToken = jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: "15m" }
  )

  const refreshToken = jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "14d" }
  )

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      auth_provider: user.provider
    }
  }
}

// 내 정보 조회
export async function getMe(userId) {
  const user = await repository.findById(userId)

  if (!user) {
    const err = new Error("사용자를 찾을 수 없습니다.")
    err.status = 404
    err.code = "USER_NOT_FOUND"
    throw err
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    auth_provider: user.provider,
    last_login: user.last_login,
    created_at: user.created_at
  }
}
