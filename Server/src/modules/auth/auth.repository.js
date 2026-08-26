import { query } from "../../db/pool.js"

export async function findByEmail(email) {
  const result = await query("SELECT * FROM users WHERE email = $1", [email])
  return result.rows[0]
}

export async function findById(id) {
  const result = await query("SELECT * FROM users WHERE id = $1", [id])
  return result.rows[0]
}

export async function create({ name, email, password }) {
  const result = await query(
    `INSERT INTO users (name, email, password, provider)
     VALUES ($1, $2, $3, 'LOCAL')
     RETURNING id, name, email`,
    [name, email, password]
  )
  return result.rows[0]
}

export async function updateLastLogin(id) {
  await query("UPDATE users SET last_login = NOW() WHERE id = $1", [id])
}
