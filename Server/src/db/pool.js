import pg from "pg"

// PostgreSQL DATE는 시간대가 없는 날짜 값이므로
// JavaScript Date로 변환하지 않고 YYYY-MM-DD 문자열 그대로 사용한다.
pg.types.setTypeParser(1082, (value) => value)

// 모든 데이터는 PostgreSQL 한 곳에 저장한다
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
})

// 쿼리 실행 헬퍼 - repository에서 이 함수를 사용한다
export function query(text, params) {
  return pool.query(text, params)
}
