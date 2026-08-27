import bcrypt from "bcrypt"
import crypto from "node:crypto"
import { config } from "../../config.js"
import { createAccessToken } from "../../utils/jwt.js"
import * as authRepository from "./auth.repository.js"

function serviceError(message, status, code) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}

export function toPublicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    provider: user.provider,
    createdAt: user.created_at,
    lastLogin: user.last_login,
  }
}

export async function signup({ email: rawEmail, password, name: rawName }) {
  const email = rawEmail?.trim().toLowerCase()
  const name = rawName?.trim()

  if (!email || !password || !name) {
    throw serviceError("이메일, 비밀번호, 이름은 필수입니다.", 400, "MISSING_FIELD")
  }
  if (password.length < 8) {
    throw serviceError("비밀번호는 8자 이상으로 입력해주세요.", 400, "INVALID_PASSWORD")
  }
  if (password.length > 72) {
    throw serviceError("비밀번호는 72자 이하로 입력해주세요.", 400, "INVALID_PASSWORD")
  }
  if (await authRepository.findByEmail(email)) {
    throw serviceError("이미 가입된 이메일입니다.", 409, "DUPLICATE_EMAIL")
  }

  try {
    const passwordHash = await bcrypt.hash(password, config.bcrypt.saltRounds)
    const user = await authRepository.createUser({ email, passwordHash, name })
    return toPublicUser(user)
  } catch (error) {
    if (error.code === "23505") {
      throw serviceError("이미 사용 중인 회원 정보입니다.", 409, "DUPLICATE_EMAIL")
    }
    throw error
  }
}

export async function login({ email: rawEmail, password }) {
  const email = rawEmail?.trim().toLowerCase()
  if (!email || !password) {
    throw serviceError("이메일과 비밀번호를 입력해주세요.", 400, "MISSING_FIELD")
  }

  const user = await authRepository.findByEmail(email)
  const matches = user?.provider === "LOCAL" && user?.password
    ? await bcrypt.compare(password, user.password)
    : false

  if (!user || !matches) {
    throw serviceError("이메일 또는 비밀번호가 올바르지 않습니다.", 401, "LOGIN_FAILED")
  }

  return {
    user: toPublicUser(user),
    ...(await createSession(user.id)),
  }
}

export async function getMe(userId) {
  const user = await authRepository.findById(userId)
  if (!user) throw serviceError("사용자를 찾을 수 없습니다.", 404, "USER_NOT_FOUND")
  return toPublicUser(user)
}

export async function loginWithOAuth({ provider, email, name }) {
  let user = await authRepository.findByEmail(email)
  if (!user) {
    user = await authRepository.createOAuthUser({ email, name, provider })
  } else if (user.provider !== provider) {
    throw serviceError(
      "같은 이메일의 기존 계정이 있습니다. 기존 계정으로 로그인해주세요.",
      409,
      "EXISTING_EMAIL",
    )
  }
  return { user: toPublicUser(user), ...(await createSession(user.id)) }
}

function hashRefreshToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex")
}

async function createSession(userId) {
  const accessToken = createAccessToken(userId)
  const refreshToken = crypto.randomBytes(48).toString("base64url")
  const tokenHash = hashRefreshToken(refreshToken)
  const expiresAt = new Date(Date.now() + config.jwt.refreshExpiresInDays * 24 * 60 * 60 * 1000)

  await authRepository.createRefreshToken({ userId, tokenHash, expiresAt })
  await authRepository.updateLastLogin(userId)
  return { accessToken, refreshToken }
}

export async function refreshSession(refreshToken) {
  if (!refreshToken) throw serviceError("로그인이 필요합니다.", 401, "UNAUTHORIZED")

  const stored = await authRepository.consumeRefreshToken(hashRefreshToken(refreshToken))
  if (!stored) throw serviceError("로그인 정보가 만료되었습니다.", 401, "INVALID_REFRESH_TOKEN")

  return createSession(stored.user_id)
}

export async function logout(refreshToken) {
  if (!refreshToken) return false
  return authRepository.revokeRefreshToken(hashRefreshToken(refreshToken))
}