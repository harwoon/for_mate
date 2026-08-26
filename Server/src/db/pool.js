import pg from "pg"

// 모든 데이터는 PostgreSQL 한 곳에 저장한다
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

// 쿼리 실행 헬퍼 - repository에서 이 함수를 사용한다
export function query(text, params) {
  return pool.query(text, params)
}
