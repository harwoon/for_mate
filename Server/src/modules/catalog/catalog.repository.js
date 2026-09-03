import { query } from "../../db/pool.js"

// 사용 테이블: breeds

// species와 keyword가 전달된 경우에만 WHERE 조건을 추가한다.
// 매개변수 바인딩을 사용해 사용자 입력이 SQL문에 직접 삽입되지 않도록 한다.
export async function findBreeds({ species, keyword }) {
  const conditions = []
  const values = []

  if (species) {
    values.push(species)
    conditions.push(`species = $${values.length}`)
  }

  if (keyword) {
    values.push(`%${keyword}%`)
    conditions.push(`name ILIKE $${values.length}`)
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(" AND ")}`
    : ""

  const result = await query(
    `SELECT id, species, name
     FROM breeds
     ${whereClause}
     ORDER BY species ASC, name ASC`,
    values
  )

  return result.rows
}
