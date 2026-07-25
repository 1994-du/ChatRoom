<template>
  <div class="public-chat dxx_wrap">
    <Transition name="notify-fade">
      <div 
        v-if="notifyMessage.show" 
        class="custom-notify"
        :style="{ 
          top: 'var(--app-header-height)',
          background: notifyMessage.background 
        }"
      >
        {{ notifyMessage.text }}
      </div>
    </Transition>
    <div class="chat-container" :style="chatContainerStyle">
      <div class="message-list" ref="messageList">
        <div 
          v-for="(msg, index) in messages" 
          :key="msg.id || index"
          :class="['message-item', msg.isSelf ? 'self' : 'other']"
        >
          <div class="avatar">
            <van-image
              round
              width="40"
              height="40"
              :src="msg.avatar"
            />
          </div>
          <div class="message-content">
            <div class="username" v-if="!msg.isSelf">{{ msg.fromUsername }}</div>
            <div :class="['bubble', msg.type === 'card' ? 'card-bubble' : '', msg.image ? 'image-bubble' : '', msg.voice ? 'voice-bubble' : '']">
              <van-image
                v-if="msg.image"
                :src="msg.image"
                fit="cover"
                class="message-image"
                @click="previewImage(msg.previewImage || msg.image)"
              />
              <button
                v-else-if="msg.voice"
                type="button"
                class="voice-message"
                @click="playVoice(msg.voice)"
              >
                <van-icon name="volume-o" size="18" />
                <span class="voice-wave">
                  <i></i>
                  <i></i>
                  <i></i>
                </span>
                <span class="voice-duration">{{ msg.voiceDuration || 1 }}''</span>
              </button>
              <span v-else>{{ msg.content }}</span>
            </div>
            <div class="time">{{ msg.time }}</div>
          </div>
        </div>
        <div ref="bottomAnchor"></div>
      </div>

      <Transition name="drawer-slide">
        <div
          v-if="showOnlineUsers"
          class="online-users-overlay"
          :style="onlineUsersOverlayStyle"
          @click.self="showOnlineUsers = false"
        >
          <div class="online-users-panel">
            <div class="panel-header">
              <span>在线用户 ({{ onlineUsers.length }})</span>
              <van-icon name="cross" size="20" @click="showOnlineUsers = false" />
            </div>
                <div class="user-list">
                  <div
                v-for="(user, index) in onlineUsers"
                :key="user.userId ?? user.username ?? index"
                class="user-item"
              >
                <van-image
                  round
                  width="40"
                  height="40"
                  :src="user.avatar"
                />
                <div class="user-info">
                  <div class="user-name">{{ user.username }}</div>
                  <div class="user-status">在线</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>

      <Transition name="record-fade">
        <div v-if="isRecording" class="recording-mask">
          <div class="recording-card">
            <div class="recording-pulse">
              <van-icon name="volume-o" size="30" />
            </div>
            <div class="recording-time">{{ recordDuration }}''</div>
            <div class="recording-tip">松开发送，上滑取消</div>
          </div>
        </div>
      </Transition>

      <div class="input-area" :style="inputAreaStyle">
        <div class="chat-toolbar">
          <button
            type="button"
            class="tool-btn voice-toggle-btn"
            :class="{ active: isVoiceMode }"
            @click="toggleVoiceMode"
          >
            <van-icon :name="isVoiceMode ? 'edit' : 'volume-o'" size="22" />
          </button>

          <button
            v-if="isVoiceMode"
            type="button"
            class="voice-hold-btn"
            :class="{ recording: isRecording, processing: isVoiceProcessing }"
            :disabled="isVoiceProcessing"
            @touchstart.prevent="startVoiceRecord($event)"
            @touchmove.prevent="handleVoiceTouchMove"
            @touchend.prevent="finishVoiceRecord"
            @touchcancel.prevent="cancelVoiceRecord"
            @pointerdown.prevent="startVoiceRecord($event)"
            @pointermove.prevent="handleVoiceTouchMove"
            @pointerup.prevent="finishVoiceRecord"
            @pointercancel.prevent="cancelVoiceRecord"
            @mousedown.prevent="startVoiceRecord($event)"
            @mouseup.prevent="finishVoiceRecord"
            @mouseleave.prevent="cancelVoiceRecord"
          >
            {{ isVoiceProcessing ? '正在发送' : isRecording ? '松开发送' : '按住说话' }}
          </button>

          <div v-else class="message-input-shell">
            <textarea
              ref="textareaRef"
              v-model="inputMessage"
              class="message-textarea"
              rows="1"
              placeholder="输入消息..."
              @input="handleInputChange"
              @focus="handleInputFocus"
              @blur="handleInputBlur"
              @keydown.enter.exact.prevent="sendMessage"
            ></textarea>
          </div>

          <button
            v-if="!isVoiceMode && hasInputText"
            type="button"
            class="send-text-btn compact"
            @click="sendMessage"
          >
            发送
          </button>

          <button
            type="button"
            class="tool-btn emoji-btn"
            :class="{ active: showEmojiPanel }"
            @click="toggleEmojiPanel"
          >
            <van-icon name="smile-o" size="22" />
          </button>

          <button
            type="button"
            class="tool-btn plus-btn"
            :class="{ active: showMorePanel }"
            @click="toggleMorePanel"
          >
            <van-icon name="add-o" size="22" />
          </button>
        </div>

        <Transition name="emoji-panel">
          <div v-if="showEmojiPanel" class="emoji-panel">
            <button
              v-for="emoji in emojiList"
              :key="emoji"
              type="button"
              class="emoji-item"
              @click="insertEmoji(emoji)"
            >
              {{ emoji }}
            </button>
          </div>
        </Transition>

        <Transition name="emoji-panel">
          <div v-if="showMorePanel" class="more-panel">
            <button
              v-for="action in moreActionList"
              :key="action.title"
              type="button"
              class="more-item"
                @click="handleMoreActionCompat(action)"
            >
              <span class="more-icon" :style="{ background: action.background }">
                <van-icon :name="action.icon" size="22" />
              </span>
              <span class="more-title">{{ action.title }}</span>
            </button>
          </div>
        </Transition>

        <input
          ref="cameraInputRef"
          type="file"
          accept="image/*"
          capture="environment"
          class="hidden-file-input"
          @change="handleFileInputChange"
        />
        <input
          ref="galleryInputRef"
          type="file"
          accept="image/*"
          class="hidden-file-input"
          @change="handleFileInputChange"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onUnmounted, computed, watch } from 'vue'
import { showImagePreview, showToast } from 'vant'
import { useUserStore } from '@/stores/user'
import { getUploadFileUrl, getUploadVoiceUrl, uploadFile, uploadImage } from '@/api/upload'
import wsService from '@/utils/websocket'
import { resolveUserProfile } from '@/utils/userProfile'
import { waitForAuthReady } from '@/utils/authReady'
import {
  openCamera as nativeOpenCamera,
  openGallery as nativeOpenGallery,
  startNativeVoiceRecord,
  stopNativeVoiceRecord,
  cancelNativeVoiceRecord,
  isAndroidVoiceAvailable,
  registerKeyboardHandler,
  registerPhotoHandlers,
  registerVoiceHandlers
} from '@/utils/nativeBridge'

const userStore = useUserStore()

const inputMessage = ref('')
const messageList = ref(null)
const bottomAnchor = ref(null)
const cameraInputRef = ref(null)
const galleryInputRef = ref(null)
const showOnlineUsers = ref(false)
const onlineUsers = ref([])
const keyboardHeight = ref(0)
const textareaRef = ref(null)
const activePanel = ref('')
const pendingImageMessages = ref([])
const isVoiceMode = ref(false)
const isRecording = ref(false)
const isVoiceProcessing = ref(false)
const recordDuration = ref(0)
const BASE_COMPOSER_HEIGHT = 72
const BOTTOM_PANEL_HEIGHT = 220
const MIN_VOICE_DURATION = 1
const emojiList = ['😀', '😁', '😂', '🤣', '😊', '😍', '😘', '😎', '🥳', '🤔', '😭', '😡', '👍', '👀', '🙏', '🎉', '❤️', '🔥', '👏', '💪', '😴', '🤝', '✨', '🎈']
const moreActionList = [
  { title: '拍照', value: 'camera', icon: 'photograph', background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)' },
  { title: '相册', value: 'gallery', icon: 'photo-o', background: 'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)' }
]

const notifyMessage = ref({
  show: false,
  text: '',
  background: '#07c160'
})

let notifyTimer = null
let cleanupPhotoHandlers = null
let cleanupVoiceHandlers = null
let cleanupKeyboardHandler = null
let cleanupVoiceReleaseHandlers = null
let recordStartedAt = 0
let recordTimer = null
let shouldCancelRecord = false
let currentVoiceCallbackId = ''
let voiceStartPending = false
let voicePendingReleaseAction = ''
let voiceRecordMode = ''
let browserMediaRecorder = null
let browserMediaStream = null
let browserVoiceChunks = []
let activeAudio = null

const showEmojiPanel = computed(() => activePanel.value === 'emoji')
const showMorePanel = computed(() => activePanel.value === 'more')
const hasInputText = computed(() => inputMessage.value.trim().length > 0)

const createVoiceCallbackId = () => `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const getChatAuthContext = () => {
  const normalizedUserId = Number(userStore.id)
  const hasUserId = userStore.id !== null
    && userStore.id !== undefined
    && String(userStore.id).trim() !== ''
    && Number.isFinite(normalizedUserId)
  const username = typeof userStore.username === 'string'
    ? userStore.username.trim()
    : ''
  const hasUsername = Boolean(username)

  return {
    hasToken: Boolean(userStore.token),
    userId: hasUserId ? normalizedUserId : null,
    username,
    hasProfile: Boolean(userStore.profileReady),
    hasAuth: Boolean(userStore.token) && hasUserId && hasUsername
  }
}

const getOnlineUserDisplayName = (user, fallbackIndex = 0) => {
  const profile = resolveUserProfile(user)
  const candidates = [
    profile.username,
    user?.username,
    user?.userName,
    user?.name,
    user?.nickname,
    user?.realName,
    user?.fromUsername,
    user?.senderName,
    user?.fromName,
    user?.displayName
  ]
  const displayName = candidates.find((value) => typeof value === 'string' && value.trim())

  if (displayName) {
    return displayName.trim()
  }

  const rawUserId = profile.userId ?? user?.userId ?? user?.id ?? user?.uid
  if (rawUserId !== null && rawUserId !== undefined && String(rawUserId).trim()) {
    return `用户${String(rawUserId).trim()}`
  }

  return `用户${fallbackIndex + 1}`
}

const normalizeOnlineUser = (user, fallbackIndex = 0) => {
  const profile = resolveUserProfile(user)
  const rawUserId = profile.userId ?? user?.userId ?? user?.id ?? user?.uid ?? null
  const numericUserId = Number(rawUserId)
  const userId = Number.isFinite(numericUserId) ? numericUserId : rawUserId
  const avatar = profile.avatar
    || user?.avatar
    || user?.avatarUrl
    || user?.headImg
    || user?.headImage
    || user?.photo
    || ''

  return {
    ...user,
    userId,
    username: getOnlineUserDisplayName(user, fallbackIndex),
    avatar: wsService.getAvatarUrl(avatar)
  }
}

const getOnlineUserKey = (user) => String(user.userId ?? user.username)

const isBrowserVoiceRecordSupported = () => {
  const nav = typeof navigator === 'undefined' ? null : navigator
  return Boolean(nav?.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined')
}

const getBrowserVoiceMimeType = () => {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return ''
  }

  const mimeTypes = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
    'audio/mp4',
    'audio/m4a',
    'audio/aac'
  ]

  return mimeTypes.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

const stopBrowserVoiceTracks = () => {
  if (!browserMediaStream) {
    return
  }

  browserMediaStream.getTracks().forEach((track) => {
    try {
      track.stop()
    } catch (error) {
      console.warn('停止浏览器语音轨道失败:', error)
    }
  })

  browserMediaStream = null
}

const resetBrowserVoiceRecorder = () => {
  browserMediaRecorder = null
  browserVoiceChunks = []
  voiceRecordMode = ''
}

const detachVoiceReleaseHandlers = () => {
  cleanupVoiceReleaseHandlers?.()
  cleanupVoiceReleaseHandlers = null
}

const attachVoiceReleaseHandlers = () => {
  detachVoiceReleaseHandlers()

  const handleVoiceRelease = (event) => {
    if (!isRecording.value) {
      if (!voiceStartPending) {
        return
      }

      if (event?.type === 'touchcancel' || event?.type === 'pointercancel' || shouldCancelRecord) {
        voicePendingReleaseAction = 'cancel'
      } else if (voicePendingReleaseAction !== 'cancel') {
        voicePendingReleaseAction = 'finish'
      }
      return
    }

    if (event?.type === 'touchcancel' || event?.type === 'pointercancel') {
      cancelVoiceRecord()
      return
    }

    if (shouldCancelRecord) {
      cancelVoiceRecord()
      return
    }

    finishVoiceRecord()
  }

  const options = { capture: true, passive: false }
  const target = document
  const eventTypes = ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'mouseup']

  eventTypes.forEach((eventType) => {
    target.addEventListener(eventType, handleVoiceRelease, options)
  })

  cleanupVoiceReleaseHandlers = () => {
    eventTypes.forEach((eventType) => {
      target.removeEventListener(eventType, handleVoiceRelease, options)
    })
    cleanupVoiceReleaseHandlers = null
  }
}

const showUserNotify = (text, background = '#07c160') => {
  if (notifyTimer) {
    clearTimeout(notifyTimer)
  }
  notifyMessage.value = { show: true, text, background }
  notifyTimer = setTimeout(() => {
    notifyMessage.value.show = false
  }, 2000)
}

const resetFileInput = (inputRef) => {
  if (inputRef.value) {
    inputRef.value.value = ''
  }
}

const getFileInputKind = (target) => {
  if (target === cameraInputRef.value) return 'camera'
  if (target === galleryInputRef.value) return 'gallery'
  return 'gallery'
}

const getWsConnectOptions = () => {
  const { hasToken, userId, username, hasAuth } = getChatAuthContext()
  const options = {
    url: import.meta.env.VITE_WS_URL || import.meta.env.VITE_PROXY_WS || 'ws://localhost:1234/ws',
    userInfo: {
      userId,
      username,
      avatar: userStore.avatar
    }
  }

  console.info('[H5][PublicChat] getWsConnectOptions:', {
    url: options.url,
    hasToken,
    userId,
    hasAuth,
    hasProfile: userStore.profileReady,
    username: options.userInfo.username,
    hasAvatar: Boolean(options.userInfo.avatar)
  })

  return { ...options, hasToken, hasAuth }
}

const ensureChatSocketReady = async ({ silent = false } = {}) => {
  await waitForAuthReady()

  console.info('[H5][PublicChat] ensureChatSocketReady enter:', {
    silent,
    isConnected: wsService.isConnected,
    isReady: wsService.isReady
  })
  if (wsService.isConnected && wsService.isReady) {
    return true
  }

  const { url, userInfo, hasAuth } = getWsConnectOptions()
  if (!hasAuth) {
    console.warn('[H5][PublicChat] ensureChatSocketReady skipped: auth incomplete', {
      hasToken: Boolean(userStore.token),
      userId: userStore.id || null,
      username: userStore.username || '',
      profileReady: userStore.profileReady
    })
    if (!silent) {
      showToast('登录信息未就绪，请稍后重试')
    }
    return false
  }
  if (!silent) {
    showToast('正在恢复连接...')
  }

  try {
    await wsService.ensureConnected(url, userInfo)
    console.info('[H5][PublicChat] ensureChatSocketReady resolved:', {
      url,
      userId: userInfo.userId
    })
    return true
  } catch (error) {
    console.error('恢复 WebSocket 失败:', error)
    if (!silent) {
      showToast('连接失败，请稍后重试')
    }
    return false
  }
}

const getImageMessageUrl = (imageUrl) => wsService.getAvatarUrl(imageUrl)

const SERVER_RELATIVE_IMAGE_PATTERN = /^\/?(uploads?|files?|images?|img|static)\//i
const IMAGE_EXTENSION_MAP = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
}

const isRemoteImageUrl = (imageSource) => (
  typeof imageSource === 'string'
  && (
    /^(https?:|blob:)/.test(imageSource.trim())
    || SERVER_RELATIVE_IMAGE_PATTERN.test(imageSource.trim())
  )
)

const getImageUploadFilename = (imageSource, source = 'gallery') => {
  const fallbackExt = typeof imageSource === 'string'
    ? imageSource.match(/^data:(image\/[^;]+);/)?.[1]
    : imageSource?.type
  const ext = IMAGE_EXTENSION_MAP[fallbackExt] || 'jpg'
  return `chat-${source}-${Date.now()}.${ext}`
}

const getVoiceFileExtension = (mimeType = '', fileName = '') => {
  const lowerMime = String(mimeType || '').toLowerCase()
  const lowerFileName = String(fileName || '').toLowerCase()

  if (lowerFileName.endsWith('.m4a') || lowerMime.includes('mp4') || lowerMime.includes('m4a')) return 'm4a'
  if (lowerFileName.endsWith('.mp3') || lowerMime.includes('mpeg') || lowerMime.includes('mp3')) return 'mp3'
  if (lowerFileName.endsWith('.ogg') || lowerMime.includes('ogg')) return 'ogg'
  if (lowerFileName.endsWith('.wav') || lowerMime.includes('wav')) return 'wav'
  if (lowerFileName.endsWith('.aac') || lowerMime.includes('aac')) return 'aac'
  return 'webm'
}

const uploadVoiceFile = async (voiceSource, fileName = '', mimeType = '') => {
  const toast = showToast({
    type: 'loading',
    message: '语音上传中...',
    forbidClick: true,
    duration: 0
  })

  try {
    let file = null

    if (typeof File !== 'undefined' && voiceSource instanceof File) {
      file = voiceSource
    } else if (typeof Blob !== 'undefined' && voiceSource instanceof Blob) {
      const ext = getVoiceFileExtension(voiceSource.type, fileName)
      file = new File([voiceSource], fileName || `voice-${Date.now()}.${ext}`, {
        type: voiceSource.type || mimeType || 'audio/webm'
      })
    } else if (typeof voiceSource === 'string') {
      const trimmed = voiceSource.trim()
      if (!trimmed) {
        throw new Error('语音数据为空')
      }

      if (/^data:audio\//i.test(trimmed)) {
        const [header = '', base64 = ''] = trimmed.split(',')
        const voiceMime = header.match(/:(.*?);/)?.[1] || mimeType || 'audio/webm'
        const binary = atob(base64)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        const ext = getVoiceFileExtension(voiceMime, fileName)
        file = new File([bytes], fileName || `voice-${Date.now()}.${ext}`, { type: voiceMime })
      } else if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('blob:') || trimmed.startsWith('/')) {
        const response = await fetch(trimmed)
        const blob = await response.blob()
        const ext = getVoiceFileExtension(blob.type || mimeType, fileName)
        file = new File([blob], fileName || `voice-${Date.now()}.${ext}`, {
          type: blob.type || mimeType || 'audio/webm'
        })
      } else {
        const voiceMime = mimeType || 'audio/webm'
        const ext = getVoiceFileExtension(voiceMime, fileName)
        const binary = atob(trimmed)
        const bytes = new Uint8Array(binary.length)
        for (let index = 0; index < binary.length; index += 1) {
          bytes[index] = binary.charCodeAt(index)
        }
        file = new File([bytes], fileName || `voice-${Date.now()}.${ext}`, { type: voiceMime })
      }
    }

    if (!file) {
      throw new Error('语音数据格式不支持')
    }

    const response = await uploadFile(file, {
      text: fileName || ''
    })
    const voiceUrl = getUploadVoiceUrl(response)

    if (!voiceUrl) {
      throw new Error('上传接口未返回语音地址')
    }

    return voiceUrl
  } finally {
    toast.close()
  }
}

const uploadChatImage = async (imageSource, source = 'gallery', options = {}) => {
  if (isRemoteImageUrl(imageSource)) {
    return imageSource.trim()
  }

  const toast = options.showLoading === false
    ? null
    : showToast({
      type: 'loading',
      message: '图片上传中...',
      forbidClick: false,
      duration: 0
    })

  try {
    const size = imageSource?.size || (typeof imageSource === 'string' ? imageSource.length : 0)
    console.log('准备上传聊天图片:', {
      source,
      type: imageSource?.type || (typeof imageSource === 'string' ? 'base64' : ''),
      size
    })
    const response = await uploadImage(imageSource, {
      filename: getImageUploadFilename(imageSource, source)
    })
    const imageUrl = getUploadFileUrl(response)

    if (!imageUrl) {
      throw new Error('上传接口未返回图片地址')
    }

    return imageUrl
  } finally {
    toast?.close()
  }
}

const createImageThumbnail = (imageSource, maxDimension = 480) => {
  if (typeof Image === 'undefined' || !imageSource) {
    return Promise.resolve('')
  }

  let objectUrl = ''
  let imageUrl = imageSource
  if (typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    objectUrl = URL.createObjectURL(imageSource)
    imageUrl = objectUrl
  }

  return new Promise((resolve) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => {
      try {
        const longestSide = Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height)
        const scale = longestSide > maxDimension ? maxDimension / longestSide : 1
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale))
        canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale))
        const context = canvas.getContext('2d')
        if (!context) {
          resolve('')
          return
        }

        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      } catch (error) {
        console.warn('生成图片缩略图失败:', error)
        resolve('')
      } finally {
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl)
        }
      }
    }
    image.onerror = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
      resolve('')
    }
    image.src = imageUrl
  })
}

const createImageClientMessageId = () => (
  `img_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
)

const getMessageTime = () => {
  const now = new Date()
  return {
    rawTime: now.toISOString(),
    time: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`
  }
}

const addPendingImageMessage = ({
  clientMessageId,
  image,
  previewImage,
  source,
  rawTime,
  time,
  temporaryPreviewUrl = ''
}) => {
  pendingImageMessages.value.push({
    id: clientMessageId,
    clientMessageId,
    type: 'image',
    messageType: 'image',
    fromUsername: userStore.username || '我',
    userId: Number(userStore.id),
    message: '',
    image: image || previewImage,
    previewImage: previewImage || image,
    sourceImage: previewImage || image,
    sourcePreviewImage: image || previewImage,
    avatar: wsService.getAvatarUrl(userStore.avatar),
    time,
    rawTime,
    source,
    uploading: true,
    temporaryPreviewUrl
  })
}

const updatePendingImageMessage = (clientMessageId, patch) => {
  const message = pendingImageMessages.value.find(
    (item) => item.clientMessageId === clientMessageId
  )
  if (message) {
    Object.assign(message, patch)
  }
  return message
}

const removePendingImageMessage = (clientMessageId) => {
  const index = pendingImageMessages.value.findIndex(
    (item) => item.clientMessageId === clientMessageId
  )
  if (index < 0) return

  const [message] = pendingImageMessages.value.splice(index, 1)
  if (message?.temporaryPreviewUrl && typeof URL !== 'undefined') {
    URL.revokeObjectURL(message.temporaryPreviewUrl)
  }
}

const isSameImageSource = (left, right) => (
  left === right
  || (
    typeof left === 'string'
    && typeof right === 'string'
    && left.trim() === right.trim()
  )
)

const sendImageMessage = async (imageUrl, source = 'gallery', options = {}) => {
  const isReady = await ensureChatSocketReady()
  if (!isReady) {
    return false
  }

  const { time, rawTime } = options.timeInfo || getMessageTime()
  const clientMessageId = options.clientMessageId || createImageClientMessageId()
  const previewImageUrl = options.previewImageUrl || imageUrl

  wsService.send({
    type: 'chat',
    messageType: 'image',
    clientMessageId,
    payload: {
      userId: Number(userStore.id),
      fromUsername: userStore.username,
      avatar: userStore.avatar,
      message: '',
      content: '',
      time,
      rawTime,
      image: imageUrl,
      imageUrl,
      originalImage: imageUrl,
      originalUrl: imageUrl,
      previewImage: previewImageUrl,
      thumbnail: previewImageUrl,
      type: 'image',
      messageType: 'image',
      source
    }
  })

  activePanel.value = ''
  return true
}

const sendImageWithPreview = async (imageSource, source = 'gallery', providedPreviewImage = '') => {
  const isReady = await ensureChatSocketReady()
  if (!isReady) {
    return
  }

  const clientMessageId = createImageClientMessageId()
  const timeInfo = getMessageTime()
  let temporaryPreviewUrl = ''
  let localPreviewImage = providedPreviewImage

  if (!localPreviewImage && typeof Blob !== 'undefined' && imageSource instanceof Blob) {
    temporaryPreviewUrl = URL.createObjectURL(imageSource)
    localPreviewImage = temporaryPreviewUrl
  }
  if (!localPreviewImage) {
    localPreviewImage = imageSource
  }
  const originalPreviewSource = temporaryPreviewUrl
    || (typeof imageSource === 'string' ? imageSource : localPreviewImage)

  addPendingImageMessage({
    clientMessageId,
    image: localPreviewImage,
    previewImage: originalPreviewSource,
    source,
    ...timeInfo,
    temporaryPreviewUrl
  })
  activePanel.value = ''
  scrollToBottom()

  try {
    let previewSource = providedPreviewImage
    if (!previewSource && typeof Blob !== 'undefined' && imageSource instanceof Blob) {
      previewSource = await createImageThumbnail(imageSource)
      if (previewSource) {
        updatePendingImageMessage(clientMessageId, {
          image: previewSource,
          sourcePreviewImage: previewSource
        })
      }
    }
    previewSource = previewSource || imageSource

    const imageUrl = await uploadChatImage(imageSource, source)
    let previewImageUrl = imageUrl
    if (previewSource && !isSameImageSource(previewSource, imageSource)) {
      try {
        previewImageUrl = await uploadChatImage(
          previewSource,
          `${source}-preview`,
          { showLoading: false }
        )
      } catch (error) {
        console.warn('上传图片缩略图失败，将使用原图:', error)
      }
    }

    updatePendingImageMessage(clientMessageId, {
      image: previewImageUrl,
      previewImage: imageUrl,
      sourceImage: imageUrl,
      sourcePreviewImage: previewImageUrl,
      uploading: false
    })

    const sent = await sendImageMessage(imageUrl, source, {
      clientMessageId,
      previewImageUrl,
      timeInfo
    })
    if (!sent) {
      throw new Error('WebSocket 未连接')
    }
  } catch (error) {
    removePendingImageMessage(clientMessageId)
    throw error
  } finally {
    const pendingMessage = pendingImageMessages.value.find(
      (item) => item.clientMessageId === clientMessageId
    )
    if (pendingMessage?.temporaryPreviewUrl && pendingMessage.image !== pendingMessage.temporaryPreviewUrl) {
      URL.revokeObjectURL(pendingMessage.temporaryPreviewUrl)
      pendingMessage.temporaryPreviewUrl = ''
    }
  }
}

const sendVoiceMessage = async (voiceUrl, duration = 1) => {
  const isReady = await ensureChatSocketReady()
  if (!isReady) {
    return
  }

  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const time = `${hours}:${minutes}`
  const clientMessageId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  wsService.send({
    type: 'chat',
    messageType: 'voice',
    clientMessageId,
    payload: {
      userId: Number(userStore.id),
      fromUsername: userStore.username,
      avatar: userStore.avatar,
      message: '',
      content: '',
      time,
      voice: voiceUrl,
      voiceUrl,
      audioUrl: voiceUrl,
      duration,
      type: 'voice',
      messageType: 'voice'
    }
  })

  activePanel.value = ''
}

const handleFileInputChange = async (event) => {
  const target = event.target
  const file = target?.files?.[0]
  if (!file) return

  try {
    const source = getFileInputKind(target)
    await sendImageWithPreview(file, source)
  } catch (error) {
    console.error('发送图片失败:', error)
    showToast(error.message || '发送图片失败')
  } finally {
    resetFileInput(cameraInputRef)
    resetFileInput(galleryInputRef)
  }
}

const handleMoreActionCompat = async (action) => {
  const value = action?.value || ''
  if (value === 'camera') {
    await ensureChatSocketReady({ silent: true })
    if (!nativeOpenCamera(callbackId)) {
      cameraInputRef.value?.click()
    }
    return
  }

  if (value === 'gallery') {
    await ensureChatSocketReady({ silent: true })
    if (!nativeOpenGallery(callbackId)) {
      galleryInputRef.value?.click()
    }
  }
}

const handleInputFocus = () => {
  activePanel.value = ''
  setTimeout(() => {
    resizeTextarea()
    scrollToBottom()
  }, 100)
}

const handleInputBlur = () => {
  setTimeout(() => {
    scrollToBottom()
  }, 100)
}

const resizeTextarea = () => {
  const textarea = textareaRef.value

  if (!textarea) return

  textarea.style.height = '20px'
  textarea.style.height = `${Math.min(textarea.scrollHeight, 92)}px`
}

const handleInputChange = () => {
  resizeTextarea()
}

const toggleVoiceMode = () => {
  if (isRecording.value) {
    cancelVoiceRecord()
  }
  isVoiceMode.value = !isVoiceMode.value
  activePanel.value = ''
  keyboardHeight.value = 0
  textareaRef.value?.blur()
}

const cleanupRecorder = () => {
  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }

  isRecording.value = false
  isVoiceProcessing.value = false
  currentVoiceCallbackId = ''
  voiceStartPending = false
  voicePendingReleaseAction = ''
  stopBrowserVoiceTracks()
  resetBrowserVoiceRecorder()
  detachVoiceReleaseHandlers()
}

const startBrowserVoiceRecord = async () => {
  if (!isBrowserVoiceRecordSupported()) {
    if (typeof window !== 'undefined' && window.isSecureContext === false) {
      showToast('浏览器语音需要 HTTPS 或 localhost')
    } else {
      showToast('当前浏览器不支持麦克风录音')
    }
    return false
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const preferredMimeType = getBrowserVoiceMimeType()
    let recorder

    try {
      recorder = preferredMimeType
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)
    } catch (error) {
      if (preferredMimeType) {
        recorder = new MediaRecorder(stream)
      } else {
        throw error
      }
    }

    browserMediaStream = stream
    browserMediaRecorder = recorder
    browserVoiceChunks = []
    voiceRecordMode = 'browser'

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        browserVoiceChunks.push(event.data)
      }
    }

    recorder.onerror = (event) => {
      console.error('浏览器语音录制失败:', event)
      cleanupRecorder()
      showToast('语音录制失败')
    }

    recorder.onstop = () => {
      const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm'
      const blob = browserVoiceChunks.length > 0
        ? new Blob(browserVoiceChunks, { type: mimeType })
        : null
      const fileName = `voice-${Date.now()}.${getVoiceFileExtension(mimeType, '')}`

      browserVoiceChunks = []
      stopBrowserVoiceTracks()
      resetBrowserVoiceRecorder()

      void handleVoiceResult({
        callbackId: currentVoiceCallbackId,
        audio: blob,
        type: mimeType,
        mimeType,
        fileName,
        durationMs: Date.now() - recordStartedAt
      })
    }

    recordStartedAt = Date.now()
    recorder.start()
    return true
  } catch (error) {
    console.error('浏览器语音启动失败:', error)
    stopBrowserVoiceTracks()
    resetBrowserVoiceRecorder()
    if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') {
      showToast('麦克风权限被拒绝')
    } else {
      showToast('无法使用电脑麦克风')
    }
    return false
  }
}

const stopBrowserVoiceRecord = () => {
  if (!browserMediaRecorder || browserMediaRecorder.state !== 'recording') {
    return false
  }

  try {
    browserMediaRecorder.stop()
    return true
  } catch (error) {
    console.error('结束浏览器语音录制失败:', error)
    return false
  }
}

const startVoiceRecord = async (event) => {
  if (isRecording.value || isVoiceProcessing.value) {
    return
  }

  try {
    activePanel.value = ''
    keyboardHeight.value = 0
    shouldCancelRecord = false
    recordDuration.value = 0
    isVoiceProcessing.value = false
    currentVoiceCallbackId = createVoiceCallbackId()
    voiceStartPending = true
    voicePendingReleaseAction = ''

    const pointerTarget = event?.currentTarget
    if (pointerTarget?.setPointerCapture && event?.pointerId !== undefined && event?.pointerId !== null) {
      try {
        pointerTarget.setPointerCapture(event.pointerId)
      } catch (captureError) {
        console.warn('语音指针捕获失败:', captureError)
      }
    }

    attachVoiceReleaseHandlers()

    const started = isAndroidVoiceAvailable()
      ? startNativeVoiceRecord(currentVoiceCallbackId)
      : await startBrowserVoiceRecord()

    if (!started) {
      cleanupRecorder()
      return
    }

    recordStartedAt = Date.now()
    voiceStartPending = false
    isRecording.value = true
    recordTimer = setInterval(() => {
      recordDuration.value = Math.max(1, Math.round((Date.now() - recordStartedAt) / 1000))
    }, 300)

    if (voicePendingReleaseAction === 'cancel') {
      voicePendingReleaseAction = ''
      cancelVoiceRecord()
      return
    }

    if (voicePendingReleaseAction === 'finish') {
      voicePendingReleaseAction = ''
      finishVoiceRecord()
    }
  } catch (error) {
    cleanupRecorder()
    console.error('语音启动失败:', error)
    showToast('无法使用语音功能')
  }
}

const handleVoiceTouchMove = (event) => {
  const point = event.touches?.[0] || event.changedTouches?.[0] || event
  if (typeof point?.clientY !== 'number') return
  shouldCancelRecord = point.clientY < window.innerHeight - 180
}

const finishVoiceRecord = () => {
  if (!isRecording.value || isVoiceProcessing.value) {
    return
  }

  isRecording.value = false
  isVoiceProcessing.value = true
  detachVoiceReleaseHandlers()

  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }

  const stopped = voiceRecordMode === 'browser'
    ? stopBrowserVoiceRecord()
    : stopNativeVoiceRecord()

  if (!stopped) {
    isVoiceProcessing.value = false
    showToast(voiceRecordMode === 'browser' ? '当前浏览器不支持语音录制' : '当前环境不支持原生语音')
    cleanupRecorder()
  }
}

const cancelVoiceRecord = () => {
  if (!isRecording.value) {
    return
  }

  shouldCancelRecord = true
  isRecording.value = false
  isVoiceProcessing.value = true
  detachVoiceReleaseHandlers()

  if (recordTimer) {
    clearInterval(recordTimer)
    recordTimer = null
  }

  const canceled = voiceRecordMode === 'browser'
    ? stopBrowserVoiceRecord()
    : cancelNativeVoiceRecord()

  if (!canceled) {
    isVoiceProcessing.value = false
    cleanupRecorder()
  }
}

const setKeyboardHeight = (visible, height) => {
  console.log('键盘状态:', { visible, height })
  if (visible && height > 0) {
    keyboardHeight.value = height
    activePanel.value = ''
  } else {
    keyboardHeight.value = 0
  }
  console.log('设置键盘高度:', keyboardHeight.value)
  setTimeout(scrollToBottom, 50)
}

const initWebSocket = async ({ silent = true } = {}) => {
  await waitForAuthReady()

  const { hasToken, userId, username, hasAuth } = getChatAuthContext()
  console.info('[H5][PublicChat] initWebSocket:', {
    hasToken,
    userId,
    hasAuth,
    username,
    profileReady: userStore.profileReady,
    isConnected: wsService.isConnected,
    isReady: wsService.isReady
  })
  if (!hasAuth) {
    console.warn('[H5][PublicChat] WebSocket skipped: auth incomplete', {
      hasToken,
      userId,
      username,
      profileReady: userStore.profileReady
    })
    return false
  }

  return ensureChatSocketReady({ silent })
}

const handleAppResume = () => {
  console.info('[H5][PublicChat] handleAppResume:', {
    visibilityState: document.visibilityState,
    hasToken: Boolean(userStore.token),
    userId: userStore.id || null,
    isConnected: wsService.isConnected,
    isReady: wsService.isReady
  })
  if (document.visibilityState && document.visibilityState !== 'visible') {
    return
  }

  if (userStore.token && userStore.id) {
    ensureChatSocketReady({ silent: true })
  }
}

const handleVisibilityChange = () => {
  if (document.visibilityState && document.visibilityState !== 'visible') {
    cancelVoiceRecord()
    return
  }

  if (document.visibilityState === 'visible') {
    handleAppResume()
  }
}

const getMessageTimestamp = (message) => {
  const timestamp = message?.rawTime ? new Date(message.rawTime).getTime() : 0
  return Number.isNaN(timestamp) ? 0 : timestamp
}

const isPendingImageEcho = (message) => pendingImageMessages.value.some((pendingMessage) => {
  const messageClientId = message?.clientMessageId || message?.sourceMessageId
  if (messageClientId && messageClientId === pendingMessage.clientMessageId) {
    return true
  }

  if (
    pendingMessage.uploading
    || message?.type !== 'image'
    || Number(message.userId) !== Number(pendingMessage.userId)
  ) {
    return false
  }

  const pendingImage = pendingMessage.sourceImage || pendingMessage.previewImage
  const serverImage = message.sourceImage || message.previewImage || message.image
  if (!pendingImage || !serverImage) {
    return false
  }

  const sameImage = wsService.getImageIdentity(pendingImage)
    === wsService.getImageIdentity(serverImage)
  if (!sameImage) {
    return false
  }

  const pendingTime = getMessageTimestamp(pendingMessage)
  const serverTime = getMessageTimestamp(message)
  return !pendingTime || !serverTime || Math.abs(pendingTime - serverTime) <= 2 * 60 * 1000
})

const messages = computed(() => {
  const currentUserId = Number(userStore.id)
  const serverMessages = wsService.messages.filter((message) => !isPendingImageEcho(message))
  return [...serverMessages, ...pendingImageMessages.value]
    .filter(msg => msg?.image || msg?.voice || (typeof msg?.message === 'string' && msg.message.trim()))
    .sort((a, b) => {
      const timeA = getMessageTimestamp(a) || (a.id || 0)
      const timeB = getMessageTimestamp(b) || (b.id || 0)
      return timeA - timeB
    })
    .map(msg => {
      const isSelf = Number(msg.userId) === currentUserId
      return {
        id: msg.id,
        content: msg.message,
        type: msg.type,
        isSelf: isSelf,
        image: msg.image || '',
        previewImage: msg.previewImage || msg.image || '',
        imageUploading: Boolean(msg.uploading),
        voice: msg.voice || '',
        voiceDuration: msg.voiceDuration || 0,
        avatar: msg.avatar,
        time: msg.time,
        fromUsername: msg.fromUsername
      }
    })
})

const keyboardOffset = computed(() => (
  keyboardHeight.value > 0 ? keyboardHeight.value : 0
))

const chatContainerStyle = computed(() => ({
  paddingBottom: `${currentComposerHeight.value + keyboardOffset.value}px`
}))

const inputAreaStyle = computed(() => ({
  bottom: keyboardHeight.value > 0
    ? `${keyboardHeight.value}px`
    : 'var(--app-tabbar-height)'
}))

const onlineUsersOverlayStyle = computed(() => ({
  bottom: `${currentComposerHeight.value + keyboardOffset.value}px`
}))

const currentComposerHeight = computed(() => (
  BASE_COMPOSER_HEIGHT + ((showEmojiPanel.value || showMorePanel.value) ? BOTTOM_PANEL_HEIGHT : 0)
))

const scrollToBottom = () => {
  nextTick(() => {
    if (bottomAnchor.value) {
      bottomAnchor.value.scrollIntoView({ behavior: 'smooth' })
    } else if (messageList.value) {
      messageList.value.scrollTop = messageList.value.scrollHeight
    }
  })
}

watch(
  () => [wsService.messages.length, pendingImageMessages.value.length],
  ([newMessageLength, newPendingLength], [oldMessageLength, oldPendingLength]) => {
    if (newMessageLength > oldMessageLength || newPendingLength > oldPendingLength) {
      scrollToBottom()
    }
  }
)

watch(keyboardHeight, () => {
  nextTick(() => {
    scrollToBottom()
  })
})

watch(activePanel, () => {
  nextTick(() => {
    scrollToBottom()
  })
})

watch(
  () => [userStore.token, userStore.id, userStore.username, userStore.avatar, userStore.profileReady],
  () => {
    const { hasToken, userId, username, hasAuth } = getChatAuthContext()
    if (!hasAuth) {
      return
    }

    const currentUserInfo = wsService.userInfo || {}
    const hasValidSocketUserInfo = Number(currentUserInfo.userId) === userId
      && String(currentUserInfo.username || '').trim() === username
      && String(currentUserInfo.avatar || '') === String(userStore.avatar || '')

    if (!wsService.isConnected || !wsService.isReady || !hasValidSocketUserInfo) {
      console.info('[H5][PublicChat] auth ready, ensuring WebSocket connection:', {
        hasToken,
        userId,
        username,
        isConnected: wsService.isConnected,
        isReady: wsService.isReady,
        hasValidSocketUserInfo
      })
      void (async () => {
        if (wsService.isConnected || wsService.isReady) {
          wsService.close()
          await new Promise((resolve) => setTimeout(resolve, 150))
        }

        if (getChatAuthContext().hasAuth) {
          await initWebSocket({ silent: true })
        }
      })()
    }
  }
)

const focusTextarea = () => {
  textareaRef.value?.focus()
}

const toggleEmojiPanel = () => {
  if (showEmojiPanel.value) {
    activePanel.value = ''
    return
  }

  activePanel.value = 'emoji'
  keyboardHeight.value = 0
  textareaRef.value?.blur()
  nextTick(() => {
    scrollToBottom()
  })
}

const toggleMorePanel = () => {
  if (showMorePanel.value) {
    activePanel.value = ''
    return
  }

  activePanel.value = 'more'
  keyboardHeight.value = 0
  textareaRef.value?.blur()
  nextTick(() => {
    scrollToBottom()
  })
}

const insertEmoji = (emoji) => {
  const textarea = textareaRef.value

  if (!textarea) {
    inputMessage.value += emoji
    return
  }

  const start = textarea.selectionStart ?? inputMessage.value.length
  const end = textarea.selectionEnd ?? inputMessage.value.length
  inputMessage.value = `${inputMessage.value.slice(0, start)}${emoji}${inputMessage.value.slice(end)}`

  nextTick(() => {
    resizeTextarea()
    const caret = start + emoji.length
    if (!showEmojiPanel.value) {
      textarea.focus()
    }
    textarea.setSelectionRange(caret, caret)
  })
}

const callbackId = `chat_${Date.now()}`

const handlePhotoResult = async (data) => {
  try {
    const {
      callbackId: id,
      image: imageData,
      imageBase64,
      imageUrl,
      previewImage,
      previewBase64,
      thumbnail
    } = data || {}
    if (id !== callbackId) return

    const rawImage = imageData || imageBase64 || imageUrl
    if (!rawImage) {
      showToast('图片数据为空')
      return
    }

    const localPreviewImage = previewImage || previewBase64 || thumbnail || ''
    await sendImageWithPreview(rawImage, 'android', localPreviewImage)
  } catch (error) {
    showToast('发送图片失败')
    console.error(error)
  }
}
const handlePhotoError = (data) => {
  const { callbackId: id, error } = data || {}
  if (id === callbackId) {
    showToast('获取图片失败: ' + error)
  }
}

const handleVoiceResult = async (data) => {
  try {
    const {
      callbackId: id,
      audio,
      audioBase64,
      audioUrl,
      type: voiceType,
      mimeType,
      fileName,
      durationMs,
      duration
    } = data || {}

    if (id && id !== currentVoiceCallbackId) return

    const canceled = shouldCancelRecord

    if (canceled) {
      cleanupRecorder()
      showToast('已取消')
      return
    }

    const durationValue = Math.max(
      1,
      Math.round((Number(durationMs || duration || 0) / 1000) || ((Date.now() - recordStartedAt) / 1000))
    )

    if (durationValue < MIN_VOICE_DURATION) {
      cleanupRecorder()
      showToast('说话时间太短')
      return
    }

    const rawAudio = audio || audioBase64 || audioUrl
    if (!rawAudio) {
      cleanupRecorder()
      showToast('语音数据为空')
      return
    }

    const uploadedVoiceUrl = await uploadVoiceFile(rawAudio, fileName, mimeType || voiceType)
    await sendVoiceMessage(uploadedVoiceUrl, durationValue)
    cleanupRecorder()
  } catch (error) {
    cleanupRecorder()
    console.error('发送语音失败:', error)
    showToast(error.message || '发送语音失败')
  }
}

const handleVoiceError = (data) => {
  const { callbackId: id, error } = data || {}
  if (!id || id === currentVoiceCallbackId) {
    cleanupRecorder()
    showToast(error || '语音录制失败')
  }
}

const sendMessage = async () => {
  const text = inputMessage.value.trim()
  console.info('[H5][PublicChat] sendMessage attempt:', {
    hasInput: Boolean(text),
    inputLength: text.length,
    userId: userStore.id || null,
    hasToken: Boolean(userStore.token),
    isConnected: wsService.isConnected,
    isReady: wsService.isReady,
    socketReady: wsService.isSocketReady()
  })
  if (!text) return

  if (!wsService.isSocketReady()) {
    const connected = await ensureChatSocketReady()
    if (!connected || !wsService.isSocketReady()) {
      return
    }
  }

  const now = new Date()
  const hours = now.getHours().toString().padStart(2, '0')
  const minutes = now.getMinutes().toString().padStart(2, '0')
  const time = `${hours}:${minutes}`
  
  const message = {
    type: 'chat',
    payload: {
      userId: Number(userStore.id),
      fromUsername: userStore.username,
      avatar: userStore.avatar,
      message: text,
      time: time
    }
  }
  
  wsService.send(message)
  console.info('[H5][PublicChat] sendMessage dispatched:', {
    type: message.type,
    userId: message.payload.userId,
    textLength: message.payload.message.length
  })
  
  inputMessage.value = ''
  activePanel.value = ''
  
  nextTick(() => {
    resizeTextarea()
    focusTextarea()
  })
}

const handleChatMessage = () => {
  scrollToBottom()
}

const previewImage = (imageUrl) => {
  if (!imageUrl) return
  showImagePreview([imageUrl])
}

const playVoice = (voiceUrl) => {
  if (!voiceUrl) return

  if (activeAudio) {
    activeAudio.pause()
    activeAudio = null
  }

  activeAudio = new Audio(voiceUrl)
  activeAudio.play().catch((error) => {
    console.error('播放语音失败:', error)
    showToast('语音播放失败')
  })
}

const handleOnlineUsers = (users) => {
  console.log('[H5][PublicChat][onlineUsers raw]', users)
  console.log('[H5][PublicChat][onlineUsers raw JSON]', (() => {
    try {
      return JSON.stringify(users)
    } catch (error) {
      return '[unserializable]'
    }
  })())
  const currentUserId = getChatAuthContext().userId
  const sourceUsers = Array.isArray(users) ? users : (users ? [users] : [])
  const normalizedUsers = new Map()

  sourceUsers.forEach((sourceUser, index) => {
    const user = normalizeOnlineUser(sourceUser, index)
    if (currentUserId !== null && Number(user.userId) === currentUserId) {
      return
    }

    const userKey = getOnlineUserKey(user)
    if (!normalizedUsers.has(userKey)) {
      console.log('处理在线用户:', {
        userId: user.userId,
        username: user.username,
        avatar: user.avatar
      })
      normalizedUsers.set(userKey, user)
    }
  })

  onlineUsers.value = Array.from(normalizedUsers.values())
  console.log('[H5][PublicChat][onlineUsers normalized]', onlineUsers.value)
}

const handleUserOnline = (user) => {
  const normalizedUser = normalizeOnlineUser(user)
  const currentUserId = getChatAuthContext().userId
  console.log('用户上线:', normalizedUser)
  if (currentUserId === null || Number(normalizedUser.userId) !== currentUserId) {
    const userKey = getOnlineUserKey(normalizedUser)
    const existingIndex = onlineUsers.value.findIndex((item) => getOnlineUserKey(item) === userKey)
    if (existingIndex === -1) {
      onlineUsers.value.push(normalizedUser)
    } else {
      onlineUsers.value[existingIndex] = {
        ...onlineUsers.value[existingIndex],
        ...normalizedUser
      }
    }
    showUserNotify(`${normalizedUser.username} 上线了`, '#07c160')
  }
}

const handleUserOffline = (user) => {
  const normalizedUser = normalizeOnlineUser(user)
  const currentUserId = getChatAuthContext().userId
  console.log('用户下线:', normalizedUser)
  if (currentUserId === null || Number(normalizedUser.userId) !== currentUserId) {
    const userKey = getOnlineUserKey(normalizedUser)
    const index = onlineUsers.value.findIndex((item) => getOnlineUserKey(item) === userKey)
    if (index >= 0) {
      onlineUsers.value.splice(index, 1)
    }
    showUserNotify(`${normalizedUser.username} 下线了`, '#ff976a')
  }
}

const handleReady = () => {
  // 上线通知已经在WebSocket的onopen事件中发送了
  console.log('WebSocket已准备好')
}

const handleChatHistory = (historyMessages) => {
  console.log('收到聊天历史并已回显:', historyMessages)
  scrollToBottom()
}

const handleHeaderAction = (event) => {
  if (event.detail?.action === 'online-users') {
    showOnlineUsers.value = true
  }
}

onMounted(() => {
  console.info('[H5][PublicChat] onMounted:', {
    hasToken: Boolean(userStore.token),
    userId: userStore.id || null,
    username: userStore.username || ''
  })
  wsService.clearMessages()
  onlineUsers.value = []

  wsService.on('ready', handleReady)
  wsService.on('chat', handleChatMessage)
  wsService.on('chatHistory', handleChatHistory)
  wsService.on('onlineUsers', handleOnlineUsers)
  wsService.on('userOnline', handleUserOnline)
  wsService.on('userOffline', handleUserOffline)
  window.addEventListener('app-header-action', handleHeaderAction)
  window.addEventListener('focus', handleAppResume)
  window.addEventListener('pageshow', handleAppResume)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  cleanupPhotoHandlers = registerPhotoHandlers({
    onResult: handlePhotoResult,
    onError: handlePhotoError
  })
  cleanupVoiceHandlers = registerVoiceHandlers({
    onResult: handleVoiceResult,
    onError: handleVoiceError
  })
  cleanupKeyboardHandler = registerKeyboardHandler((visible, height) => {
    console.log('输入法状态:', { visible, height })
    setKeyboardHeight(visible, height)
  })

  scrollToBottom()
  nextTick(() => {
    resizeTextarea()
    void waitForAuthReady().then(() => {
      const { hasAuth } = getChatAuthContext()
      if (hasAuth) {
        void initWebSocket({ silent: true })
      } else {
        console.info('[H5][PublicChat] skip initial websocket connect: profile incomplete', {
          hasToken: Boolean(userStore.token),
          userId: userStore.id || null,
          username: userStore.username || '',
          profileReady: userStore.profileReady
        })
      }
    })
  })
})

onUnmounted(() => {
  console.info('[H5][PublicChat] onUnmounted: closing websocket')
  wsService.close()
  wsService.off('ready', handleReady)
  wsService.off('chat', handleChatMessage)
  wsService.off('chatHistory', handleChatHistory)
  wsService.off('onlineUsers', handleOnlineUsers)
  wsService.off('userOnline', handleUserOnline)
  wsService.off('userOffline', handleUserOffline)
  window.removeEventListener('app-header-action', handleHeaderAction)
  window.removeEventListener('focus', handleAppResume)
  window.removeEventListener('pageshow', handleAppResume)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  cleanupPhotoHandlers?.()
  cleanupVoiceHandlers?.()
  cleanupKeyboardHandler?.()
  cleanupPhotoHandlers = null
  cleanupVoiceHandlers = null
  cleanupKeyboardHandler = null
  cleanupRecorder()
  if (activeAudio) {
    activeAudio.pause()
    activeAudio = null
  }
})
</script>

<style scoped lang="less">
.public-chat {
  display: flex;
  flex-direction: column;
  background-color: #f7f8fa;
  overflow: hidden;
}

.chat-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}

.message-list {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  padding-bottom: 20px;
  min-height: 0;
}

.message-item {
  display: flex;
  margin-bottom: 20px;
  
  &.self {
    flex-direction: row-reverse;
    
    .message-content {
      align-items: flex-end;
    }
    
    .bubble {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
  }
  
  &.other {
    .bubble {
      background: #fff;
      color: #333;
    }
  }
}

.avatar {
  flex-shrink: 0;
  margin: 0 10px;
}

.message-content {
  display: flex;
  flex-direction: column;
  max-width: 70%;
}

.username {
  font-size: 12px;
  color: #999;
  margin-bottom: 4px;
  padding: 0 5px;
}

.bubble {
  padding: 10px 15px;
  border-radius: 8px;
  word-wrap: break-word;
  word-break: break-all;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.image-bubble {
  padding: 6px;
}

.voice-bubble {
  min-width: 128px;
  padding: 0;
}

.message-image {
  display: block;
  width: 180px;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
}

.voice-message {
  width: 100%;
  min-width: 128px;
  height: 42px;
  border: 0;
  background: transparent;
  color: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  font: inherit;
}

.voice-wave {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: 1;

  i {
    width: 3px;
    border-radius: 999px;
    background: currentColor;
    opacity: 0.72;
  }

  i:nth-child(1) {
    height: 8px;
  }

  i:nth-child(2) {
    height: 14px;
  }

  i:nth-child(3) {
    height: 20px;
  }
}

.voice-duration {
  font-size: 13px;
}

.hidden-file-input {
  display: none;
}

.card-bubble {
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%) !important;
  color: #333 !important;
  border: 1px solid #ff9a9e;
  font-weight: 500;
}

.time {
  font-size: 12px;
  color: #999;
  margin-top: 5px;
  padding: 0 5px;
}

.input-area {
  position: fixed;
  bottom: calc(var(--app-tabbar-height));
  left: 0;
  right: 0;
  background: #f3f4f6;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  z-index: 100;
  transition: bottom 0.15s ease-out;
}

.chat-toolbar {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.tool-btn,
.send-btn,
.emoji-item,
.voice-hold-btn,
.voice-message {
  border: 0;
  outline: none;
  font: inherit;
}

.tool-btn {
  width: 36px;
  height: 38px;
  border-radius: 50%;
  background: transparent;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.active {
    color: #07c160;
  }
}

.voice-toggle-btn {
  color: #111827;
}

.message-input-shell {
  flex: 1;
  min-height: 40px;
  max-height: 112px;
  background: #ffffff;
  border-radius: 22px;
  padding: 10px 14px;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
}

.message-textarea {
  width: 100%;
  min-height: 20px;
  max-height: 92px;
  resize: none;
  border: 0;
  outline: none;
  background: transparent;
  color: #111827;
  font-size: 15px;
  line-height: 1.4;
  display: block;
}

.message-textarea::placeholder {
  color: #9ca3af;
}

.voice-hold-btn {
  flex: 1;
  height: 40px;
  border-radius: 22px;
  background: #fff;
  color: #111827;
  font-size: 15px;
  font-weight: 600;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;

  &.recording {
    background: #e5e7eb;
    color: #374151;
  }
}

.send-btn {
  display: none;
}

.send-text-btn {
  min-width: 64px;
  height: 40px;
  border-radius: 20px;
  padding: 0 18px;
  border: none;
  background: linear-gradient(135deg, #647cf0 0%, #7b52ba 100%);
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  flex-shrink: 0;
  box-shadow: 0 10px 22px rgba(109, 94, 211, 0.22);
  transition: transform 0.18s ease, opacity 0.18s ease;

  &.compact {
    min-width: 52px;
    padding: 0 12px;
  }

  &:active {
    transform: scale(0.96);
  }
}

.recording-mask {
  position: absolute;
  inset: 0;
  z-index: 320;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.recording-card {
  width: 160px;
  height: 160px;
  border-radius: 26px;
  background: rgba(17, 24, 39, 0.86);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  box-shadow: 0 18px 44px rgba(15, 23, 42, 0.28);
  backdrop-filter: blur(12px);
}

.recording-pulse {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: rgba(7, 193, 96, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: recordPulse 1s ease-in-out infinite;
}

.recording-time {
  font-size: 20px;
  font-weight: 700;
}

.recording-tip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
}

.record-fade-enter-active,
.record-fade-leave-active {
  transition: opacity 0.16s ease;
}

.record-fade-enter-from,
.record-fade-leave-to {
  opacity: 0;
}

@keyframes recordPulse {
  0%,
  100% {
    transform: scale(0.94);
  }

  50% {
    transform: scale(1.06);
  }
}

.emoji-panel {
  margin-top: 10px;
  height: 220px;
  padding: 14px 6px 8px;
  border-radius: 22px 22px 0 0;
  background: linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%);
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  overflow-y: auto;
}

.emoji-item {
  height: 42px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.82);
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 10px rgba(15, 23, 42, 0.05);
}

.emoji-panel-enter-active,
.emoji-panel-leave-active {
  transition: all 0.22s ease;
}

.emoji-panel-enter-from,
.emoji-panel-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

.more-panel {
  margin-top: 10px;
  height: 220px;
  padding: 18px 10px 10px;
  border-radius: 22px 22px 0 0;
  background: linear-gradient(180deg, #ffffff 0%, #f5f7fb 100%);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 88px));
  justify-content: start;
  gap: 14px 10px;
  overflow: hidden;
}

.more-item {
  appearance: none;
  -webkit-appearance: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  outline: none;
  box-shadow: none;
  padding: 0;

  &:focus,
  &:focus-visible {
    outline: none;
    box-shadow: none;
  }
}

.more-icon {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 10px 20px rgba(15, 23, 42, 0.08);
}

.more-title {
  font-size: 12px;
  color: #4b5563;
}

.online-users-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.online-users-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 70%;
  height: 100%;
  background: #fff;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.12);
}

.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: opacity 0.22s ease;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
}

.drawer-slide-enter-active .online-users-panel,
.drawer-slide-leave-active .online-users-panel {
  transition: transform 0.25s ease;
}

.drawer-slide-enter-from .online-users-panel,
.drawer-slide-leave-to .online-users-panel {
  transform: translateX(100%);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
  font-size: 16px;
  font-weight: 600;
}

.user-list {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}

.user-item {
  display: flex;
  align-items: center;
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 8px;
  background: #f7f8fa;
  
  &:active {
    background: #eee;
  }
}

.user-info {
  margin-left: 12px;
  flex: 1;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: #333;
}

.user-status {
  font-size: 12px;
  color: #07c160;
  margin-top: 2px;
}

.custom-notify {
  position: fixed;
  left: 0;
  right: 0;
  padding: 10px 16px;
  color: #fff;
  font-size: 14px;
  text-align: center;
  z-index: 9999;
  transition: transform 0.3s ease, opacity 0.3s ease;
}

.notify-fade-enter-active,
.notify-fade-leave-active {
  transition: all 0.3s ease;
}

.notify-fade-enter-from,
.notify-fade-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}
</style>
