import { reactive } from 'vue'
import {
  closeNativeWebSocket,
  connectNativeWebSocket,
  isNativeWebSocketAvailable,
  isNativeWebSocketConnected,
  registerNativeWebSocketHandlers,
  sendNativeWebSocket
} from '@/utils/nativeBridge'
import {
  appendTokenToWsUrl,
  getAuthExpiredReason,
  handleAuthExpired,
  isAuthExpiredPayload
} from '@/utils/authSession'

const DEFAULT_AVATAR_URL = `${import.meta.env.BASE_URL}avatar-default.svg`
const getDefaultWsUrl = () => import.meta.env.VITE_WS_URL || import.meta.env.VITE_PROXY_WS || 'ws://localhost:1234/ws'
const CONNECTED_NATIVE_STATES = ['open', 'opened', 'connected', 'ready']
const CONNECTING_NATIVE_STATES = ['connecting', 'reconnecting']
const CLOSED_NATIVE_STATES = ['close', 'closed', 'closing', 'disconnect', 'disconnected']
const ERROR_NATIVE_STATES = ['error', 'failed', 'failure']
const IMAGE_MESSAGE_TYPES = ['image', 'img', 'picture', 'photo', 'pic', '图片']
const VOICE_MESSAGE_TYPES = ['voice', 'audio', 'record', 'sound', '语音']
const IMAGE_FILE_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?.*)?(#.*)?$/i
const VOICE_FILE_PATTERN = /\.(mp3|m4a|aac|wav|ogg|webm|amr)(\?.*)?(#.*)?$/i
const IMAGE_DATA_PATTERN = /^(data:image\/|blob:)/i
const VOICE_DATA_PATTERN = /^(data:audio\/|blob:)/i
const IMAGE_RESOURCE_PATH_PATTERN = /^(https?:\/\/[^/]+)?\/?(uploads?|files?|images?|img|static)\//i
const VOICE_RESOURCE_PATH_PATTERN = /^(https?:\/\/[^/]+)?\/?(uploads?|files?|audios?|voices?|voice|audio|static)\//i
const DIRECT_IMAGE_FIELDS = [
  'originalUrl',
  'originUrl',
  'fullUrl',
  'fullImageUrl',
  'rawUrl',
  'sourceUrl',
  'image',
  'imageUrl',
  'imagePath',
  'picture',
  'pic',
  'photo',
  'mediaUrl',
  'previewImage',
  'previewUrl',
  'thumbnail',
  'thumb'
]
const ORIGINAL_IMAGE_FIELDS = [
  'originalImage',
  'originalImageUrl',
  'originalUrl',
  'originUrl',
  'fullUrl',
  'fullImageUrl',
  'rawUrl',
  'sourceUrl',
  'image',
  'imageUrl'
]
const PREVIEW_IMAGE_FIELDS = [
  'previewImage',
  'previewUrl',
  'thumbnail',
  'thumbnailUrl',
  'thumb',
  'thumbUrl',
  'smallImage',
  'smallImageUrl'
]
const DIRECT_VOICE_FIELDS = [
  'voice',
  'voiceUrl',
  'audio',
  'audioUrl',
  'recordUrl',
  'soundUrl',
  'mediaUrl'
]
const VOICE_DURATION_FIELDS = ['duration', 'voiceDuration', 'audioDuration', 'recordDuration', 'length']
const GENERIC_IMAGE_FIELDS = ['fileUrl', 'filePath', 'uri', 'url', 'path', 'src']
const CONTENT_IMAGE_FIELDS = ['message', 'content', 'text', 'msg', 'body', 'messageText', 'chatContent']
const NESTED_IMAGE_FIELDS = ['file', 'media', 'attachment', 'attach', 'data', 'extra', 'payload']
const SENDER_ID_FIELDS = [
  'fromUserId',
  'senderId',
  'senderUserId',
  'sendUserId',
  'fromId',
  'userId',
  'uid'
]
const SENDER_OBJECT_FIELDS = ['fromUser', 'sender', 'user']

const normalizeBoolean = (value) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') return value.toLowerCase() === 'true' || value === '1'
  return false
}

const parseSocketPayload = (payload) => {
  if (typeof payload !== 'string') {
    return payload
  }

  try {
    return JSON.parse(payload)
  } catch (error) {
    return payload
  }
}

const stringifyForLog = (value) => {
  try {
    return JSON.stringify(value)
  } catch (error) {
    return '[unserializable]'
  }
}

const parseJsonObject = (value) => {
  if (typeof value !== 'string') {
    return null
  }

  const normalizedValue = value.trim()
  if (!normalizedValue || !['{', '['].includes(normalizedValue[0])) {
    return null
  }

  try {
    const parsedValue = JSON.parse(normalizedValue)
    return parsedValue && typeof parsedValue === 'object' ? parsedValue : null
  } catch (error) {
    return null
  }
}

const summarizeSocketValue = (value) => {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return { type: 'array', length: value.length }
  }

  if (typeof value === 'object') {
    return {
      type: 'object',
      keys: Object.keys(value),
      state: value.state ?? value.status ?? null,
      connected: value.connected ?? null,
      ready: value.ready ?? null,
      typeField: value.type ?? value.messageType ?? null,
      reason: value.reason ?? null,
      error: value.error ?? null
    }
  }

  if (typeof value === 'string') {
    return { type: 'string', length: value.length }
  }

  return { type: typeof value, value }
}

const logSocket = (level, message, payload = {}) => {
  const logger = console[level] || console.log
  logger.call(console, `[H5][WebSocket] ${message}`, payload)
}

const sanitizeSocketUserInfo = (userInfo) => {
  if (!userInfo || typeof userInfo !== 'object') {
    return userInfo
  }

  return {
    userId: userInfo.userId ?? null,
    username: userInfo.username || '',
    hasAvatar: Boolean(userInfo.avatar),
    hasToken: Boolean(getSocketAuthToken(userInfo))
  }
}

const getSocketAuthToken = (userInfo) => {
  if (!userInfo || typeof userInfo !== 'object') {
    return ''
  }

  return String(
    userInfo.token
    || userInfo.accessToken
    || userInfo.authorization
    || ''
  ).trim()
}

const sanitizeSocketUrl = (url) => {
  const normalizedUrl = typeof url === 'string' ? url.trim() : ''
  if (!normalizedUrl) {
    return normalizedUrl
  }

  try {
    const parsedUrl = new URL(normalizedUrl)
    if (parsedUrl.searchParams.has('token')) {
      parsedUrl.searchParams.set('token', '***')
    }
    return parsedUrl.toString()
  } catch (error) {
    return normalizedUrl.replace(/([?&]token=)[^&]+/i, '$1***')
  }
}

class WebSocketService {
  constructor() {
    this.ws = null
    this.socketMode = 'browser'
    this.isConnected = false
    this.isReady = false
    this.isNativeConnecting = false
    this.reconnectTimer = null
    this.listeners = new Map()
    this.userInfo = null
    this.lastUrl = ''
    this.messages = reactive([])
    this.shouldReconnect = false
    logSocket('info', 'close requested', {
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      shouldReconnect: this.shouldReconnect
    })
    this.messageSeq = 0
    this.avatarUrlCache = new Map()
    this.preloadedAvatars = new Set()
    this.cleanupNativeHandlers = registerNativeWebSocketHandlers({
      onMessage: (data) => this.handleNativeMessage(data),
      onStatus: (data) => this.handleNativeStatus(data)
    })
    logSocket('info', 'service initialized', {
      defaultWsUrl: getDefaultWsUrl(),
      nativeAvailable: isNativeWebSocketAvailable()
    })
  }

  formatTime(timeValue) {
    if (!timeValue) {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    }

    const date = new Date(timeValue)
    if (Number.isNaN(date.getTime())) {
      return typeof timeValue === 'string' ? timeValue : this.formatTime()
    }

    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    return `${hours}:${minutes}`
  }

  normalizeChatMessage(payload, fallbackType = 'chat', index = 0) {
    const source = payload?.payload && typeof payload.payload === 'object'
      ? payload.payload
      : payload

    if (!source) {
      return null
    }

    if (typeof source !== 'object') {
      const rawTime = new Date().toISOString()
      return {
        id: `${rawTime}-unknown-chat-${index}`,
        type: fallbackType === 'card' ? 'card' : 'chat',
        fromUsername: '未知用户',
        userId: null,
        message: String(source),
        avatar: this.getAvatarUrl(''),
        time: this.formatTime(rawTime),
        rawTime
      }
    }

    const rawTime = source.rawTime
      || source.createdAt
      || source.createTime
      || source.sendTime
      || source.timestamp
      || source.time
      || new Date().toISOString()
    const parsedRawTime = new Date(rawTime)
    const normalizedRawTime = Number.isNaN(parsedRawTime.getTime())
      ? new Date().toISOString()
      : parsedRawTime.toISOString()
    const sourceType = source.type || source.messageType || source.contentType || payload?.type
    const type = sourceType === 'card' || fallbackType === 'card'
      ? 'card'
      : 'chat'
    const rawMessage = source.message
      ?? source.content
      ?? source.text
      ?? source.msg
      ?? source.body
      ?? source.messageText
      ?? source.chatContent
      ?? ''
    const message = typeof rawMessage === 'string'
      ? rawMessage
      : String(rawMessage || '')

    if (!message) {
      return null
    }

    const avatar = source.avatar || source.fromAvatar || source.headImg || source.userAvatar || ''
    const rawUserId = source.userId ?? source.fromUserId ?? source.senderId ?? source.id ?? null
    const userId = rawUserId !== null && rawUserId !== undefined && rawUserId !== ''
      ? Number(rawUserId)
      : null
    const sourceMessageId = source.id || source.messageId || source.msgId || source.uuid || null

    return {
      id: sourceMessageId || `${normalizedRawTime}-${userId || 'unknown'}-${type}-${index}-${this.messageSeq++}`,
      type,
      fromUsername: source.fromUsername
        || source.username
        || source.nickname
        || source.fromName
        || source.senderName
        || '未知用户',
      userId,
      message,
      avatar: this.getAvatarUrl(avatar),
      time: this.formatTime(rawTime),
      rawTime: normalizedRawTime,
      sourceMessageId
    }
  }

  hasMessage(messageData) {
    return this.messages.some((item) => {
      if (item.sourceMessageId && messageData.sourceMessageId && item.sourceMessageId === messageData.sourceMessageId) {
        return true
      }

      if (item.id && messageData.id && item.id === messageData.id) {
        return true
      }

      return item.userId === messageData.userId
        && item.message === messageData.message
        && item.rawTime === messageData.rawTime
        && item.type === messageData.type
    })
  }

  appendMessage(payload, fallbackType = 'chat', index = 0) {
    const messageData = this.normalizeChatMessage(payload, fallbackType, index)

    if (!messageData || this.hasMessage(messageData)) {
      return null
    }

    console.log('添加聊天消息:', messageData)
    this.messages.push(messageData)
    this.messages.sort((a, b) => {
      const timeA = a.rawTime ? new Date(a.rawTime).getTime() : 0
      const timeB = b.rawTime ? new Date(b.rawTime).getTime() : 0
      return timeA - timeB
    })
    return messageData
  }

  addHistoryMessages(payload) {
    const historyList = Array.isArray(payload)
      ? payload
      : payload?.list || payload?.messages || payload?.records || []

    if (!Array.isArray(historyList) || historyList.length === 0) {
      return []
    }

    const normalizedMessages = historyList
      .map((item, index) => this.appendMessage(item, item?.type || 'chat', index))
      .filter(Boolean)

    this.messages.sort((a, b) => {
      const timeA = a.rawTime ? new Date(a.rawTime).getTime() : 0
      const timeB = b.rawTime ? new Date(b.rawTime).getTime() : 0
      return timeA - timeB
    })

    return normalizedMessages
  }

  getAvatarUrl(avatar) {
    console.log('getAvatarUrl 输入:', avatar)
    if (!avatar) {
      const defaultUrl = 'https://fastly.jsdelivr.net/npm/@vant/assets/cat.jpeg'
      console.log('getAvatarUrl 输出(默认):', defaultUrl)
      return defaultUrl
    }
    if (avatar.startsWith('http')) {
      console.log('getAvatarUrl 输出(完整URL):', avatar)
      return avatar
    }
    const baseUrl = import.meta.env.VITE_PROXY || ''
    const fullUrl = baseUrl.replace(/\/$/, '') + avatar
    console.log('getAvatarUrl 输出(拼接):', { baseUrl, avatar, fullUrl })
    return fullUrl
  }

  isSameMessage(item, messageData) {
    if (item.sourceMessageId && messageData.sourceMessageId && item.sourceMessageId === messageData.sourceMessageId) {
      return true
    }

    if (item.id && messageData.id && item.id === messageData.id) {
      return true
    }

    if (this.isSameImageMessage(item, messageData)) {
      return true
    }

    return item.userId === messageData.userId
      && item.message === messageData.message
      && item.rawTime === messageData.rawTime
      && item.type === messageData.type
  }

  hasMessage(messageData) {
    return this.messages.some((item) => this.isSameMessage(item, messageData))
  }

  sortMessages() {
    this.messages.sort((a, b) => {
      const timeA = a.rawTime ? new Date(a.rawTime).getTime() : 0
      const timeB = b.rawTime ? new Date(b.rawTime).getTime() : 0
      return timeA - timeB
    })
  }

  getImageIdentity(imageUrl) {
    const normalizedImageUrl = typeof imageUrl === 'string' ? imageUrl.trim() : ''

    if (!normalizedImageUrl) {
      return ''
    }

    try {
      const parsedUrl = normalizedImageUrl.startsWith('http')
        ? new URL(normalizedImageUrl)
        : new URL(normalizedImageUrl.replace(/^\/+/, ''), 'http://local/')
      return decodeURIComponent(parsedUrl.pathname.split('/').filter(Boolean).pop() || parsedUrl.pathname)
    } catch (error) {
      return decodeURIComponent(normalizedImageUrl.split(/[?#]/)[0].split('/').filter(Boolean).pop() || normalizedImageUrl)
    }
  }

  getMessageTimeValue(message) {
    const timestamp = message?.rawTime ? new Date(message.rawTime).getTime() : 0
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  isSameImageMessage(item, messageData) {
    if (item?.type !== 'image' || messageData?.type !== 'image') {
      return false
    }

    const itemImage = this.getImageIdentity(item.sourceImage || item.image)
    const messageImage = this.getImageIdentity(messageData.sourceImage || messageData.image)
    if (!itemImage || !messageImage || itemImage !== messageImage) {
      return false
    }

    if (item.userId !== null && messageData.userId !== null && item.userId !== messageData.userId) {
      return false
    }

    const itemTime = this.getMessageTimeValue(item)
    const messageTime = this.getMessageTimeValue(messageData)
    if (!itemTime || !messageTime) {
      return true
    }

    return Math.abs(itemTime - messageTime) <= 60 * 1000
  }

  preloadAvatar(avatarUrl) {
    if (!avatarUrl || this.preloadedAvatars.has(avatarUrl) || typeof Image === 'undefined') {
      return
    }

    this.preloadedAvatars.add(avatarUrl)
    const image = new Image()
    image.decoding = 'async'
    image.src = avatarUrl
  }

  appendMessage(payload, fallbackType = 'chat', index = 0, options = {}) {
    const messageData = this.normalizeChatMessage(payload, fallbackType, index)

    if (!messageData || this.hasMessage(messageData)) {
      return null
    }

    this.messages.push(messageData)
    this.preloadAvatar(messageData.avatar)

    if (!options.skipSort) {
      this.sortMessages()
    }

    return messageData
  }

  addHistoryMessages(payload) {
    const historyList = Array.isArray(payload)
      ? payload
      : payload?.list || payload?.messages || payload?.records || []

    if (!Array.isArray(historyList) || historyList.length === 0) {
      return []
    }

    const normalizedMessages = []

    historyList.forEach((item, index) => {
      const messageData = this.normalizeChatMessage(item, item?.type || 'chat', index)

      if (!messageData || this.hasMessage(messageData)) {
        return
      }

      if (messageData.type === 'image') {
        console.log('聊天历史图片归一化:', {
          imageField: messageData.imageField,
          sourceImage: messageData.sourceImage,
          displayImage: messageData.image,
          raw: item
        })
      }

      const existsInBatch = normalizedMessages.some((message) => this.isSameMessage(message, messageData))
      if (!existsInBatch) {
        normalizedMessages.push(messageData)
      }
    })

    if (normalizedMessages.length === 0) {
      return []
    }

    normalizedMessages.forEach((message) => this.preloadAvatar(message.avatar))
    this.messages.push(...normalizedMessages)
    this.sortMessages()

    return normalizedMessages
  }

  getAvatarUrl(avatar) {
    const normalizedAvatar = typeof avatar === 'string' ? avatar.trim() : ''

    if (!normalizedAvatar) {
      return DEFAULT_AVATAR_URL
    }

    if (this.avatarUrlCache.has(normalizedAvatar)) {
      return this.avatarUrlCache.get(normalizedAvatar)
    }

    if (
      normalizedAvatar.startsWith('http')
      || normalizedAvatar.startsWith('data:')
      || normalizedAvatar.startsWith('blob:')
    ) {
      this.avatarUrlCache.set(normalizedAvatar, normalizedAvatar)
      return normalizedAvatar
    }

    const baseUrl = (import.meta.env.VITE_PROXY || '').trim()
    let fullUrl = normalizedAvatar

    if (baseUrl) {
      try {
        fullUrl = new URL(
          normalizedAvatar.replace(/^\/+/, ''),
          baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
        ).toString()
      } catch (error) {
        fullUrl = `${baseUrl.replace(/\/$/, '')}/${normalizedAvatar.replace(/^\/+/, '')}`
      }
    }

    this.avatarUrlCache.set(normalizedAvatar, fullUrl)
    return fullUrl
  }

  isImageMessageType(type) {
    return IMAGE_MESSAGE_TYPES.includes(String(type || '').trim().toLowerCase())
  }

  isVoiceMessageType(type) {
    return VOICE_MESSAGE_TYPES.includes(String(type || '').trim().toLowerCase())
  }

  toNumber(value) {
    if (value === null || value === undefined || value === '') {
      return null
    }

    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  getSenderId(source) {
    if (!source || typeof source !== 'object') {
      return null
    }

    for (const field of SENDER_ID_FIELDS) {
      const userId = this.toNumber(source[field])
      if (userId !== null) {
        return userId
      }
    }

    for (const field of SENDER_OBJECT_FIELDS) {
      const user = source[field]
      if (!user || typeof user !== 'object') {
        continue
      }

      const userId = this.toNumber(user.id ?? user.userId)
      if (userId !== null) {
        return userId
      }
    }

    return null
  }

  getMessageId(source, userId) {
    if (!source || typeof source !== 'object') {
      return null
    }

    const explicitMessageId = source.messageId
      || source.msgId
      || source.uuid
      || source.clientMessageId
      || source.socketMessageId

    if (explicitMessageId) {
      return explicitMessageId
    }

    if (source.id && String(source.id) !== String(userId ?? '')) {
      return source.id
    }

    return null
  }

  isImagePath(value) {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''

    if (!normalizedValue) {
      return false
    }

    return IMAGE_DATA_PATTERN.test(normalizedValue)
      || IMAGE_FILE_PATTERN.test(normalizedValue)
      || IMAGE_RESOURCE_PATH_PATTERN.test(normalizedValue)
  }

  isVoicePath(value) {
    const normalizedValue = typeof value === 'string' ? value.trim() : ''

    if (!normalizedValue) {
      return false
    }

    return VOICE_DATA_PATTERN.test(normalizedValue)
      || VOICE_FILE_PATTERN.test(normalizedValue)
      || VOICE_RESOURCE_PATH_PATTERN.test(normalizedValue)
  }

  getStringField(source, fields) {
    if (!source || typeof source !== 'object') {
      return null
    }

    for (const field of fields) {
      const value = source[field]

      if (typeof value === 'string' && value.trim()) {
        return {
          field,
          value: value.trim()
        }
      }
    }

    return null
  }

  extractImageSource(source, sourceType, seen = new WeakSet()) {
    if (!source || typeof source !== 'object') {
      return null
    }

    if (seen.has(source)) {
      return null
    }
    seen.add(source)

    const directImage = this.getStringField(source, DIRECT_IMAGE_FIELDS)
    if (directImage) {
      return directImage
    }

    const isImageType = this.isImageMessageType(sourceType)
    const genericImage = this.getStringField(source, GENERIC_IMAGE_FIELDS)
    if (genericImage && (isImageType || this.isImagePath(genericImage.value))) {
      return genericImage
    }

    for (const field of NESTED_IMAGE_FIELDS) {
      const value = source[field]
      const parsedValue = parseJsonObject(value)
      const nestedSource = parsedValue || (value && typeof value === 'object' ? value : null)

      if (!nestedSource) {
        continue
      }

      const nestedImage = this.extractImageSource(nestedSource, sourceType, seen)
      if (nestedImage) {
        return {
          field: `${field}.${nestedImage.field}`,
          value: nestedImage.value
        }
      }
    }

    const contentImage = this.getStringField(source, CONTENT_IMAGE_FIELDS)
    if (!contentImage) {
      return null
    }

    const parsedContent = parseJsonObject(contentImage.value)
    if (parsedContent) {
      const nestedImage = this.extractImageSource(parsedContent, sourceType, seen)
      if (nestedImage) {
        return {
          field: `${contentImage.field}.${nestedImage.field}`,
          value: nestedImage.value
        }
      }
    }

    if (isImageType || this.isImagePath(contentImage.value)) {
      return contentImage
    }

    return null
  }

  extractPreviewImageSource(source, imageSource, sourceType) {
    const previewImage = this.getStringField(source, PREVIEW_IMAGE_FIELDS)
    if (previewImage) {
      return previewImage
    }

    return imageSource || this.extractImageSource(source, sourceType)
  }

  extractVoiceSource(source, sourceType, seen = new WeakSet()) {
    if (!source || typeof source !== 'object') {
      return null
    }

    if (seen.has(source)) {
      return null
    }
    seen.add(source)

    const directVoice = this.getStringField(source, DIRECT_VOICE_FIELDS)
    if (directVoice) {
      return directVoice
    }

    const isVoiceType = this.isVoiceMessageType(sourceType)
    const genericVoice = this.getStringField(source, GENERIC_IMAGE_FIELDS)
    if (genericVoice && (isVoiceType || this.isVoicePath(genericVoice.value))) {
      return genericVoice
    }

    for (const field of NESTED_IMAGE_FIELDS) {
      const value = source[field]
      const parsedValue = parseJsonObject(value)
      const nestedSource = parsedValue || (value && typeof value === 'object' ? value : null)

      if (!nestedSource) {
        continue
      }

      const nestedVoice = this.extractVoiceSource(nestedSource, sourceType, seen)
      if (nestedVoice) {
        return {
          field: `${field}.${nestedVoice.field}`,
          value: nestedVoice.value
        }
      }
    }

    const contentVoice = this.getStringField(source, CONTENT_IMAGE_FIELDS)
    if (!contentVoice) {
      return null
    }

    const parsedContent = parseJsonObject(contentVoice.value)
    if (parsedContent) {
      const nestedVoice = this.extractVoiceSource(parsedContent, sourceType, seen)
      if (nestedVoice) {
        return {
          field: `${contentVoice.field}.${nestedVoice.field}`,
          value: nestedVoice.value
        }
      }
    }

    if (isVoiceType || this.isVoicePath(contentVoice.value)) {
      return contentVoice
    }

    return null
  }

  getVoiceDuration(source) {
    if (!source || typeof source !== 'object') {
      return 0
    }

    for (const field of VOICE_DURATION_FIELDS) {
      const duration = Number(source[field])
      if (Number.isFinite(duration) && duration > 0) {
        return Math.round(duration)
      }
    }

    return 0
  }

  normalizeChatMessage(payload, fallbackType = 'chat', index = 0) {
    const source = payload?.payload && typeof payload.payload === 'object'
      ? {
        ...payload.payload,
        id: payload.payload.id ?? payload.id,
        messageId: payload.payload.messageId ?? payload.messageId,
        msgId: payload.payload.msgId ?? payload.msgId,
        uuid: payload.payload.uuid ?? payload.uuid,
        socketMessageId: payload.id,
        clientMessageId: payload.clientMessageId || payload.payload.clientMessageId,
        messageType: payload.payload.messageType || payload.messageType,
        contentType: payload.payload.contentType || payload.contentType
      }
      : payload

    if (!source) {
      return null
    }

    if (typeof source !== 'object') {
      const rawTime = new Date().toISOString()
      return {
        id: `${rawTime}-unknown-chat-${index}`,
        type: fallbackType === 'card' ? 'card' : 'chat',
        fromUsername: '未知用户',
        userId: null,
        message: String(source),
        image: '',
        avatar: this.getAvatarUrl(''),
        time: this.formatTime(rawTime),
        rawTime
      }
    }

    const rawTime = source.rawTime
      || source.createdAt
      || source.createTime
      || source.sendTime
      || source.timestamp
      || source.time
      || new Date().toISOString()
    const parsedRawTime = new Date(rawTime)
    const normalizedRawTime = Number.isNaN(parsedRawTime.getTime())
      ? new Date().toISOString()
      : parsedRawTime.toISOString()
    const sourceType = source.type || source.messageType || source.contentType || payload?.messageType || payload?.type
    const voiceSource = this.extractVoiceSource(source, sourceType)
    const imageSource = this.isVoiceMessageType(sourceType) ? null : this.extractImageSource(source, sourceType)
    const displayImageSource = this.isVoiceMessageType(sourceType)
      ? null
      : this.extractPreviewImageSource(source, imageSource, sourceType)
    const originalImageSource = this.isVoiceMessageType(sourceType)
      ? null
      : this.getStringField(source, ORIGINAL_IMAGE_FIELDS) || imageSource
    const image = displayImageSource?.value || originalImageSource?.value || ''
    const previewImage = originalImageSource?.value || image
    const voice = voiceSource?.value || ''
    const type = sourceType === 'card'
      ? 'card'
      : this.isImageMessageType(sourceType) || image
        ? 'image'
        : this.isVoiceMessageType(sourceType) || voice
          ? 'voice'
          : fallbackType === 'card'
            ? 'card'
            : 'chat'
    const rawMessage = source.message
      ?? source.content
      ?? source.text
      ?? source.msg
      ?? source.body
      ?? source.messageText
      ?? source.chatContent
      ?? ''
    const rawMessageText = typeof rawMessage === 'string'
      ? rawMessage
      : String(rawMessage || '')
    const message = type === 'image' && rawMessageText.trim() === image
      ? ''
      : rawMessageText

    if (!message && !image && !voice) {
      return null
    }

    const avatar = source.avatar || source.fromAvatar || source.headImg || source.userAvatar || ''
    const userId = this.getSenderId(source)
    const sourceMessageId = this.getMessageId(source, userId)

    return {
      id: sourceMessageId || `${normalizedRawTime}-${userId || 'unknown'}-${type}-${index}-${this.messageSeq++}`,
      type,
      messageType: sourceType || type,
      fromUsername: source.fromUsername
        || source.username
        || source.nickname
        || source.fromName
        || source.senderName
        || '未知用户',
      userId,
      message,
      image: image ? this.getAvatarUrl(image) : '',
      previewImage: previewImage ? this.getAvatarUrl(previewImage) : '',
      voice: voice ? this.getAvatarUrl(voice) : '',
      voiceDuration: this.getVoiceDuration(source),
      sourceImage: previewImage,
      sourcePreviewImage: image,
      sourceVoice: voice,
      imageField: imageSource?.field || '',
      previewImageField: displayImageSource?.field || '',
      voiceField: voiceSource?.field || '',
      avatar: this.getAvatarUrl(avatar),
      time: this.formatTime(rawTime),
      rawTime: normalizedRawTime,
      sourceMessageId,
      clientMessageId: source.clientMessageId || ''
    }
  }

  isBrowserSocketOpen() {
    return typeof WebSocket !== 'undefined'
      && this.ws
      && this.ws.readyState === WebSocket.OPEN
  }

  isBrowserSocketConnecting() {
    return typeof WebSocket !== 'undefined'
      && this.ws
      && this.ws.readyState === WebSocket.CONNECTING
  }

  isSocketReady() {
    if (this.socketMode === 'native') {
      return (this.isConnected && this.isReady) || isNativeWebSocketConnected()
    }

    return this.isBrowserSocketOpen() && this.isConnected && this.isReady
  }

  getAuthenticatedConnectUrl(url, userInfo) {
    const baseUrl = url || this.lastUrl || getDefaultWsUrl()
    return appendTokenToWsUrl(baseUrl, getSocketAuthToken(userInfo || this.userInfo))
  }

  handleSocketAuthExpired(payload, source = 'websocket') {
    if (!isAuthExpiredPayload(payload)) {
      return false
    }

    this.shouldReconnect = false
    this.isNativeConnecting = false
    this.isConnected = false
    this.isReady = false
    if (this.socketMode === 'native') {
      closeNativeWebSocket()
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    void handleAuthExpired({
      source,
      reason: getAuthExpiredReason(payload)
    })
    return true
  }

  connect(url, userInfo, options = {}) {
    const connectUrl = this.getAuthenticatedConnectUrl(url, userInfo)
    logSocket('info', 'connect requested', {
      url: sanitizeSocketUrl(connectUrl),
      userInfo: sanitizeSocketUserInfo(userInfo),
      options: summarizeSocketValue(options),
      nativeAvailable: isNativeWebSocketAvailable()
    })
    if (isNativeWebSocketAvailable()) {
      this.connectNative(connectUrl, userInfo, options)
      return
    }

    this.connectBrowser(connectUrl, userInfo)
  }

  connectNative(url, userInfo, { force = false } = {}) {
    logSocket('info', 'connectNative enter', {
      url: sanitizeSocketUrl(url),
      force,
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      isNativeConnecting: this.isNativeConnecting,
      userInfo: sanitizeSocketUserInfo(userInfo)
    })
    if (this.socketMode === 'native' && this.isSocketReady()) {
      console.log('原生 WebSocket 已连接，跳过重复连接')
      return
    }

    if (this.socketMode === 'native' && this.isNativeConnecting && !force) {
      console.log('原生 WebSocket 正在连接，跳过重复连接')
      return
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.socketMode === 'native' && force) {
      console.log('原生 WebSocket 强制重建连接')
      closeNativeWebSocket()
    }

    this.socketMode = 'native'
    this.shouldReconnect = true
    this.userInfo = userInfo
    this.lastUrl = url
    this.isNativeConnecting = true
    this.isConnected = false
    this.isReady = false
    console.log('开始连接原生 WebSocket:', sanitizeSocketUrl(url), '用户信息:', sanitizeSocketUserInfo(userInfo))

    if (isNativeWebSocketConnected()) {
      this.isNativeConnecting = false
      this.isConnected = true
      this.isReady = true
      this.emit('open')
      this.emit('ready')
      return
    }

    const started = connectNativeWebSocket(url, userInfo)
    logSocket('info', 'connectNative dispatched', {
      url: sanitizeSocketUrl(url),
      started
    })
    if (!started) {
      this.socketMode = 'browser'
      this.isNativeConnecting = false
      this.connectBrowser(url, userInfo)
      return
    }

    setTimeout(() => {
      if (this.socketMode === 'native' && !this.isReady && isNativeWebSocketConnected()) {
        this.handleNativeStatus({ connected: true, ready: true, state: 'open' })
      }
    }, 0)
  }

  connectBrowser(url, userInfo) {
    logSocket('info', 'connectBrowser enter', {
      url: sanitizeSocketUrl(url),
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      userInfo: sanitizeSocketUserInfo(userInfo)
    })
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.isConnected) {
      console.log('WebSocket 已连接，跳过重复连接')
      return
    }

    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
      console.log('WebSocket 正在连接，跳过重复连接')
      return
    }

    if (this.ws && (
      this.ws.readyState === WebSocket.CLOSING
      || this.ws.readyState === WebSocket.CLOSED
    )) {
      this.ws = null
      this.isConnected = false
      this.isReady = false
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.shouldReconnect = true
    this.userInfo = userInfo
    this.lastUrl = url
    this.socketMode = 'browser'
    this.isNativeConnecting = false
    console.log('开始连接 WebSocket:', sanitizeSocketUrl(url), '用户信息:', sanitizeSocketUserInfo(userInfo))
    this.ws = new WebSocket(url)
    logSocket('info', 'browser socket created', {
      url: sanitizeSocketUrl(url)
    })

    this.ws.onopen = () => {
      logSocket('info', 'browser socket open', {
        url: sanitizeSocketUrl(this.lastUrl)
      })
      console.log('WebSocket 连接成功')
      this.isConnected = true
      this.isReady = true
      this.emit('open')
      this.emit('ready')
      
      // 连接成功后发送上线通知
      if (this.userInfo) {
        this.sendOnline()
      }
    }

    this.ws.onmessage = (event) => {
      logSocket('info', 'browser socket message', {
        rawType: typeof event.data,
        rawLength: typeof event.data === 'string' ? event.data.length : null
      })
      try {
        const data = JSON.parse(event.data)
        this.handleMessage(data)
      } catch (error) {
        console.error('解析消息失败:', error)
      }
    }

    this.ws.onerror = (error) => {
      logSocket('error', 'browser socket error', {
        url: sanitizeSocketUrl(this.lastUrl),
        readyState: this.ws?.readyState ?? null,
        error: summarizeSocketValue(error)
      })
      console.error('WebSocket 连接错误:', error)
      this.emit('error', error)
    }

    this.ws.onclose = (event) => {
      const closePayload = {
        code: event?.code ?? null,
        reason: event?.reason || '',
        wasClean: Boolean(event?.wasClean)
      }
      logSocket('warn', 'browser socket close', {
        url: sanitizeSocketUrl(this.lastUrl),
        shouldReconnect: this.shouldReconnect,
        readyState: this.ws?.readyState ?? null,
        closePayload
      })
      console.log('WebSocket 连接关闭')
      this.isConnected = false
      this.isReady = false
      this.emit('close', closePayload)
      if (this.handleSocketAuthExpired(closePayload, 'websocket-close')) {
        return
      }
      if (this.shouldReconnect) {
        this.reconnect()
      }
    }
  }

  handleNativeMessage(payload) {
    logSocket('info', 'native socket message callback', {
      payload: summarizeSocketValue(payload)
    })
    const data = parseSocketPayload(payload)

    if (!data || typeof data !== 'object') {
      console.warn('原生 WebSocket 消息格式异常:', payload)
      return
    }

    this.handleMessage(data)
  }

  handleNativeStatus(payload) {
    logSocket('info', 'native socket status callback', {
      payload: summarizeSocketValue(payload)
    })
    const status = parseSocketPayload(payload)
    const statusData = status && typeof status === 'object'
      ? status
      : { state: String(status || '') }
    const state = String(statusData.state || statusData.status || '').trim().toLowerCase()
    const reason = String(statusData.reason || '').trim()
    const isConnectedState = CONNECTED_NATIVE_STATES.includes(state)
    const isConnectingState = CONNECTING_NATIVE_STATES.includes(state)
    const isClosedState = CLOSED_NATIVE_STATES.includes(state)
    const isFailedState = ERROR_NATIVE_STATES.includes(state) || Boolean(statusData.error)
    const isClosedByH5 = isClosedState && reason === 'Closed by H5'
    const connected = !isClosedState && !isFailedState
      && (normalizeBoolean(statusData.connected) || isConnectedState)
    const ready = !isClosedState && !isFailedState
      && (normalizeBoolean(statusData.ready) || connected)
    const failed = isFailedState || isClosedState

    logSocket('info', 'native socket status parsed', {
      state,
      reason,
      connected,
      ready,
      connecting: isConnectingState,
      closedByH5: isClosedByH5,
      failed,
      statusData: summarizeSocketValue(statusData)
    })

    if (this.handleSocketAuthExpired(statusData, 'websocket-status')) {
      return
    }

    if (isConnectedState || connected || ready) {
      const wasReady = this.isReady
      this.socketMode = 'native'
      this.isNativeConnecting = false
      this.isConnected = true
      this.isReady = true
      this.emit('open')

      if (!wasReady) {
        this.emit('ready')
        if (this.userInfo) {
          this.sendOnline()
        }
      }
      return
    }

    if (isConnectingState) {
      this.socketMode = 'native'
      this.isNativeConnecting = true
      this.isConnected = false
      this.isReady = false
      return
    }

    if (isClosedByH5) {
      this.isNativeConnecting = false
      this.isConnected = false
      this.isReady = false
      console.log('WebSocket 已主动关闭:', statusData)
      this.emit('close', statusData)
      return
    }

    if (failed) {
      const error = statusData.error || new Error('原生 WebSocket 连接关闭')
      console.error('原生 WebSocket 状态异常:', statusData)
      this.isNativeConnecting = false
      this.isConnected = false
      this.isReady = false
      this.emit(ERROR_NATIVE_STATES.includes(state) || statusData.error ? 'error' : 'close', error)

      if (this.shouldReconnect) {
        this.reconnect()
      }
    }
  }

  handleMessage(data) {
    logSocket('info', 'handleMessage', {
      type: data?.type || null,
      payload: summarizeSocketValue(data?.payload)
    })

    if (this.handleSocketAuthExpired(data, 'websocket-message')) {
      return
    }

    if (this.handleSocketAuthExpired(data?.payload, 'websocket-message')) {
      return
    }

    switch (data.type) {
      case 'chat':
        console.log('收到聊天消息:', data.payload)
        this.appendMessage(data, data.type)
        this.emit('chat', data.payload)
        break
      case 'chatHistory':
        console.log('收到聊天历史消息:', data)
        console.log('聊天历史消息参数:', data.payload)

        this.emit('chatHistory', this.addHistoryMessages(data.payload))
        break
      case 'onlineUsers':
        console.log('[H5][OnlineUsers][raw]', {
          payload: data.payload,
          payloadJson: stringifyForLog(data.payload),
          isArray: Array.isArray(data.payload),
          count: Array.isArray(data.payload) ? data.payload.length : null
        })
        this.emit('onlineUsers', data.payload)
        break
      case 'userOnline':
        this.emit('userOnline', data.payload)
        break
      case 'userOffline':
        this.emit('userOffline', data.payload)
        break
      default:
        console.log('未知消息类型:', data.type)
    }
  }

  send(data) {
    logSocket('info', 'send requested', {
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      nativeConnected: isNativeWebSocketConnected(),
      data: summarizeSocketValue(data)
    })
    if (this.socketMode === 'native') {
      if (this.isSocketReady() || isNativeWebSocketConnected()) {
        sendNativeWebSocket(data)
        console.log('发送原生 WebSocket 消息:', data)
        return
      }

      console.error('原生 WebSocket 未连接，无法发送消息')
      throw new Error('WebSocket 未连接')
    }

    if (this.isBrowserSocketOpen() && this.isConnected) {
      this.ws.send(JSON.stringify(data))
      console.log('发送消息:', data)
    } else {
      console.error('WebSocket 未连接，无法发送消息')
      throw new Error('WebSocket 未连接')
    }
  }

  ensureConnected(url, userInfo, timeout = 8000) {
    logSocket('info', 'ensureConnected enter', {
      url: sanitizeSocketUrl(this.getAuthenticatedConnectUrl(url, userInfo)),
      timeout,
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      userInfo: sanitizeSocketUserInfo(userInfo)
    })
    if (this.isSocketReady()) {
      logSocket('info', 'ensureConnected short-circuit ready', {})
      return Promise.resolve()
    }

    const connectUrl = this.getAuthenticatedConnectUrl(url, userInfo)
    const connectUserInfo = userInfo || this.userInfo

    if (!connectUserInfo) {
      return Promise.reject(new Error('缺少 WebSocket 用户信息'))
    }

    return new Promise((resolve, reject) => {
      let timer = null
      let settled = false

      const cleanup = () => {
        if (timer) {
          clearTimeout(timer)
          timer = null
        }
        this.off('ready', handleReady)
        this.off('error', handleError)
      }

      const handleReady = () => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        logSocket('info', 'ensureConnected resolved on ready', {
          connectUrl,
          socketMode: this.socketMode
        })
        resolve()
      }

      const handleError = (error) => {
        if (settled) {
          return
        }
        settled = true
        cleanup()
        logSocket('error', 'ensureConnected rejected on error', {
          connectUrl,
          error: summarizeSocketValue(error)
        })
        reject(error || new Error('WebSocket 连接失败'))
      }

      timer = setTimeout(() => {
        if (this.socketMode === 'native') {
          closeNativeWebSocket()
          this.isNativeConnecting = false
          this.isConnected = false
          this.isReady = false
        }
        cleanup()
        logSocket('error', 'ensureConnected timeout', {
          connectUrl,
          socketMode: this.socketMode,
          userInfo: summarizeSocketValue(connectUserInfo)
        })
        reject(new Error('WebSocket 连接超时'))
      }, timeout)

      this.on('ready', handleReady)
      this.on('error', handleError)

      this.connect(connectUrl, connectUserInfo, { force: true })
      logSocket('info', 'ensureConnected dispatched connect', {
        connectUrl,
        userInfo: summarizeSocketValue(connectUserInfo)
      })

      if (this.isSocketReady()) {
        handleReady()
      }
    })
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index !== -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        callback(data)
      })
    }
  }

  reconnect() {
    if (this.reconnectTimer) {
      logSocket('info', 'reconnect skipped: timer exists', {})
      return
    }

    this.reconnectTimer = setTimeout(() => {
      logSocket('warn', 'reconnect timer fired', {
        url: sanitizeSocketUrl(this.lastUrl || getDefaultWsUrl()),
        socketMode: this.socketMode,
        userInfo: sanitizeSocketUserInfo(this.userInfo)
      })
      console.log('尝试重新连接 WebSocket...')
      this.reconnectTimer = null
      const url = this.lastUrl || getDefaultWsUrl()

      if (this.socketMode === 'native' && isNativeWebSocketAvailable()) {
        this.connect(url, this.userInfo, { force: true })
        return
      }

      this.connect(url, this.userInfo)
    }, 5000)
  }

  close() {
    this.shouldReconnect = false
    logSocket('info', 'close requested', {
      socketMode: this.socketMode,
      isConnected: this.isConnected,
      isReady: this.isReady,
      shouldReconnect: this.shouldReconnect
    })
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const shouldSendOffline = this.isConnected && this.isReady
    if (shouldSendOffline) {
      // 关闭连接前发送下线通知
      this.sendOffline()
    }

    // 等待一小段时间确保下线通知发送成功；未 ready 时也要清掉连接。
    setTimeout(() => {
      if (this.socketMode === 'native') {
        closeNativeWebSocket()
      }

      if (this.ws) {
        this.ws.close()
        this.ws = null
      }

      this.isNativeConnecting = false
      this.isConnected = false
      this.isReady = false
    }, shouldSendOffline ? 100 : 0)
  }

  clearMessages() {
    this.messages.length = 0
  }

  // 发送上线通知
  sendOnline() {
    if (this.isConnected && this.isReady && this.userInfo) {
      const username = this.userInfo.username
        || this.userInfo.userName
        || this.userInfo.nickname
        || this.userInfo.name
        || this.userInfo.fromUsername
        || ''
      const onlineMsg = {
        type: 'userOnline',
        payload: {
          userId: this.userInfo.userId,
          username,
          userName: username,
          name: username,
          nickname: username,
          fromUsername: username,
          avatar: this.userInfo.avatar
        }
      }
      try {
        this.send(onlineMsg)
        console.log('发送上线通知:', onlineMsg)
      } catch (error) {
        console.error('发送上线通知失败:', error)
      }
    }
  }

  // 发送下线通知
  sendOffline() {
    if (this.isConnected && this.isReady && this.userInfo) {
      const username = this.userInfo.username
        || this.userInfo.userName
        || this.userInfo.nickname
        || this.userInfo.name
        || this.userInfo.fromUsername
        || ''
      const offlineMsg = {
        type: 'userOffline',
        payload: {
          userId: this.userInfo.userId,
          username,
          userName: username,
          name: username,
          nickname: username,
          fromUsername: username
        }
      }
      try {
        this.send(offlineMsg)
        console.log('发送下线通知:', offlineMsg)
      } catch (error) {
        console.error('发送下线通知失败:', error)
      }
    }
  }
}

const wsService = new WebSocketService()

export default wsService
