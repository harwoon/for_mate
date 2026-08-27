import { query } from "../../db/pool.js"

const USER_COLUMNS = `id, email, password, name, provider, created_at, last_login`

export async function findByEmail(email) {
  const result = await query(
    `SELECT ${USER_COLUMNS} FROM users WHERE LOWER(email) = LOWER($1)`,
    [email.trim()],
  )
  return result.rows[0]
}

export async function findById(id) {
  const result = await query(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [id])
  return result.rows[0]
}

export async function createUser({ email, passwordHash, name }) {
  const result = await query(
    `INSERT INTO users (email, password, name, provider)
     VALUES ($1, $2, $3, 'LOCAL')
     RETURNING ${USER_COLUMNS}`,
    [email.toLowerCase(), passwordHash, name],
  )
  return result.rows[0]
}

export async function createOAuthUser({ email, name, provider }) {
  const result = await query(
    `INSERT INTO users (email, password, name, provider)
     VALUES ($1, NULL, $2, $3)
     RETURNING ${USER_COLUMNS}`,
    [email.toLowerCase(), name, provider],
  )
  return result.rows[0]
}

export async function updateLastLogin(userId) {
  await query(`UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1`, [userId])
}

export async function createRefreshToken({ userId, tokenHash, expiresAt }) {
  const result = await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)
     RETURNING id, user_id, expires_at, created_at`,
    [userId, tokenHash, expiresAt],
  )
  return result.rows[0]
}

export async function consumeRefreshToken(tokenHash) {
  const result = await query(
    `DELETE FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > CURRENT_TIMESTAMP
     RETURNING user_id`,
    [tokenHash],
  )
  return result.rows[0]
}

export async function revokeRefreshToken(tokenHash) {
  const result = await query(
    `DELETE FROM refresh_tokens WHERE token_hash = $1 RETURNING id`,
    [tokenHash],
  )
  return result.rowCount > 0
}