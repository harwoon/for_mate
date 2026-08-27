export function createRefreshToken(userId) {
  return jwt.sign({ userId }, config.jwt.refreshSecretKey, {
    expiresIn: `${config.jwt.refreshExpiresInDays}d`,
  })
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecretKey)
}