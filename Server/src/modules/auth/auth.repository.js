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