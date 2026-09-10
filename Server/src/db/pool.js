import pg from "pg"

// PostgreSQL DATE는 시간대가 없는 날짜 값이므로
// JavaScript Date로 변환하지 않고 YYYY-MM-DD 문자열 그대로 사용한다.
pg.types.setTypeParser(1082, (value) => value)

// DB의 TIMESTAMP WITHOUT TIME ZONE 값은 UTC 기준으로 저장되어 있다.
// UTC 시각으로 명시해서 JavaScript Date로 변환한다.
pg.types.setTypeParser(1114, (value) => {
    return new Date(
        `${value.replace(" ", "T")}Z`
    )
})

// Date 파라미터도 UTC로 전달해 TIMESTAMP 비교와 저장 시 로컬 시간 변환을 막는다.
pg.defaults.parseInputDatesAsUTC = true

// 모든 데이터는 PostgreSQL 한 곳에 저장한다
export const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    options: "-c timezone=UTC"
})

// 쿼리 실행 헬퍼 - repository에서 이 함수를 사용한다
export function query(text, params) {
    return pool.query(text, params)
}
