import * as repository from "./matches.repository.js"

// 매칭 대상은 구조동물(rescue_animals) 공고로 한정한다.
// 당일 첫 요청에만 계산하고, 이후에는 저장된 결과를 그대로 반환한다.

// TODO: 아래 컨트롤러에서 호출할 함수들을 구현한다
// - getMatches: 6.1 AI 매칭 결과 조회
// - getMatchDetail: 6.2 매칭 상세 비교 조회
// - refreshMatches: 6.3 매칭 재계산 요청
// - addExclusion: 6.4 매칭 후보 제외
// - getExclusions: 6.5 제외 목록 조회
// - removeExclusion: 6.5 제외 해제
