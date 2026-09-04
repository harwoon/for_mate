import { query } from "../../db/pool.js"

// 이 모듈은 일부러 비워둔다.
// 이용약관 / 개인정보처리방침 / 서비스소개는 DB 테이블이 아니라 constants/pages_content.json 파일에서
// 읽어오기 때문에(pages.service.js 참고), SQL 쿼리를 실행할 일이 없다.
// (catalog 모듈의 getRegions가 breeds 테이블 대신 regions.json 파일을 읽는 것과 같은 이유다)
//
// 나중에 관리자 페이지에서 이 문구를 DB로 옮겨 직접 수정하게 만드는 등 요구사항이 바뀌면,
// 그때 이 파일에 findByKey / update 같은 함수를 추가하고 pages.service.js에서 그 함수를 쓰도록 바꾸면 된다.
// (그 순간을 대비해 import { query }는 미리 남겨둔다)
