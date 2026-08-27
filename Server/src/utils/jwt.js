import jwt from "jsonwebtoken"

import { config } from "../config.js"

export function createAccessToken(userId) {
  return jwt.sign({ userId }, config.jwt.secretKey, {
    expiresIn: config.jwt.expiresInSec,
  })
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secretKey)
}