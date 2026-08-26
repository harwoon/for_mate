import * as service from "./auth.service.js"
import { ok, created, fail } from "../../utils/response.js"

// 1.1 회원가입
export async function signup(req, res, next) {
  try {
    const { name, email, password } = req.body

    if (!name || !email || !password) {
      return fail(res, 400, "MISSING_FIELD", "필수 항목을 모두 입력해주세요.")
    }

    const user = await service.signup({ name, email, password })
    created(res, user)
  } catch (err) {
    next(err)
  }
}

// 1.2 로그인
export async function login(req, res, next) {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return fail(res, 400, "MISSING_FIELD", "이메일과 비밀번호를 입력해주세요.")
    }

    const result = await service.login({ email, password })
    ok(res, result)
  } catch (err) {
    next(err)
  }
}

// 1.3 내 정보 조회
export async function getMe(req, res, next) {
  try {
    const user = await service.getMe(req.user.id)
    ok(res, { user })
  } catch (err) {
    next(err)
  }
}

// 1.4 토큰 재발급
export async function refresh(req, res, next) {
  try {
    // TODO: refresh_token 검증 후 새 토큰 발급
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 1.5 로그아웃
export async function logout(req, res, next) {
  try {
    // TODO: refresh_token 무효화 처리
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 1.6 비밀번호 재설정 요청
export async function resetRequest(req, res, next) {
  try {
    // TODO: 이메일로 재설정 링크 발송
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 1.6 비밀번호 재설정
export async function resetPassword(req, res, next) {
  try {
    // TODO: reset_token 검증 후 비밀번호 변경
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 1.7 소셜 로그인 URL 발급
export async function getSocialUrl(req, res, next) {
  try {
    // TODO: provider(google, kakao)별 인가 URL 생성
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}

// 1.8 소셜 로그인 콜백
export async function socialCallback(req, res, next) {
  try {
    // TODO: 인가 코드를 토큰으로 교환하고 로그인 처리
    fail(res, 501, "NOT_IMPLEMENTED", "아직 구현되지 않았습니다.")
  } catch (err) {
    next(err)
  }
}
