import { showToast } from 'vant'

const AUTH_EXPIRED_STATUS_CODES = new Set([401, 419, 440])
const AUTH_EXPIRED_MESSAGE_PATTERNS = [
  /token\s*expired/i,
  /jwt\s*expired/i,
  /unauthorized/i,
  /invalid\s*token/i,
  /登录.*过期/,
  /认证.*过期/,
  /凭证.*过期/,
  /token已过期/,
  /token过期/,
  /令牌.*过期/
]

const DEFAULT_AUTH_EXPIRED_MESSAGE = '登录状态已过期，请重新登录'

let authExpiredHandler = null
let activeAuthExpiredPromise = null

const getCandidateMessages = (payload) => {
  if (!payload || typeof payload !== 'object') {
    return []
  }

  const nestedPayload = payload.payload && typeof payload.payload === 'object'
    ? payload.payload
    : null

  return [
    payload.msg,
    payload.message,
    payload.error,
    payload.reason,
    payload.detail,
    payload.errMsg,
    payload.errorMsg,
    payload.statusText,
    nestedPayload?.msg,
    nestedPayload?.message,
    nestedPayload?.error,
    nestedPayload?.reason
  ]
}

export const isAuthExpiredMessage = (value) => {
  const normalizedValue = typeof value === 'string' ? value.trim() : ''
  if (!normalizedValue) {
    return false
  }

  if (/\b401\b/.test(normalizedValue)) {
    return true
  }

  return AUTH_EXPIRED_MESSAGE_PATTERNS.some((pattern) => pattern.test(normalizedValue))
}

export const getAuthExpiredReason = (payload, fallbackMessage = DEFAULT_AUTH_EXPIRED_MESSAGE) => {
  if (typeof payload === 'string') {
    return isAuthExpiredMessage(payload) ? payload.trim() : fallbackMessage
  }

  const message = getCandidateMessages(payload)
    .find((candidate) => isAuthExpiredMessage(candidate))

  return typeof message === 'string' && message.trim()
    ? message.trim()
    : fallbackMessage
}

export const isAuthExpiredPayload = (payload) => {
  if (payload === null || payload === undefined) {
    return false
  }

  if (typeof payload === 'number') {
    return AUTH_EXPIRED_STATUS_CODES.has(payload)
  }

  if (typeof payload === 'string') {
    return isAuthExpiredMessage(payload)
  }

  if (typeof payload !== 'object') {
    return false
  }

  const nestedPayload = payload.payload && typeof payload.payload === 'object'
    ? payload.payload
    : null
  const statusCandidates = [
    payload.code,
    payload.status,
    payload.statusCode,
    payload.errorCode,
    payload.bizCode,
    nestedPayload?.code,
    nestedPayload?.status,
    nestedPayload?.statusCode
  ]

  if (statusCandidates.some((value) => AUTH_EXPIRED_STATUS_CODES.has(Number(value)))) {
    return true
  }

  const typeCandidates = [
    payload.type,
    payload.messageType,
    nestedPayload?.type,
    nestedPayload?.messageType
  ]

  if (typeCandidates.some((value) => isAuthExpiredMessage(String(value || '')))) {
    return true
  }

  return getCandidateMessages(payload).some((candidate) => isAuthExpiredMessage(candidate))
}

export const appendTokenToWsUrl = (url, token) => {
  const normalizedUrl = typeof url === 'string' ? url.trim() : ''
  const normalizedToken = typeof token === 'string' ? token.trim() : ''

  if (!normalizedUrl || !normalizedToken) {
    return normalizedUrl
  }

  try {
    const parsedUrl = new URL(normalizedUrl)
    parsedUrl.searchParams.set('token', normalizedToken)
    return parsedUrl.toString()
  } catch (error) {
    const separator = normalizedUrl.includes('?') ? '&' : '?'
    return `${normalizedUrl}${separator}token=${encodeURIComponent(normalizedToken)}`
  }
}

export const registerAuthExpiredHandler = (handler) => {
  authExpiredHandler = typeof handler === 'function' ? handler : null
}

export const handleAuthExpired = async ({
  reason = DEFAULT_AUTH_EXPIRED_MESSAGE,
  source = 'unknown',
  silent = false
} = {}) => {
  if (activeAuthExpiredPromise) {
    return activeAuthExpiredPromise
  }

  const finalReason = typeof reason === 'string' && reason.trim()
    ? reason.trim()
    : DEFAULT_AUTH_EXPIRED_MESSAGE

  activeAuthExpiredPromise = (async () => {
    console.warn('[H5][Auth] handling auth expiration:', {
      source,
      reason: finalReason
    })

    if (!silent) {
      showToast(finalReason)
    }

    if (authExpiredHandler) {
      await authExpiredHandler({
        source,
        reason: finalReason
      })
    }
  })()
    .catch((error) => {
      console.error('[H5][Auth] handleAuthExpired failed:', error)
    })
    .finally(() => {
      activeAuthExpiredPromise = null
    })

  return activeAuthExpiredPromise
}

export { DEFAULT_AUTH_EXPIRED_MESSAGE }
