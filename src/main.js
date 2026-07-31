import { createApp } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import router from './router'
import App from './App.vue'
import { useUserStore } from '@/stores/user'
import { initAuth } from '@/utils/login'
import { registerAuthExpiredHandler } from '@/utils/authSession'
import { initVConsole } from '@/utils/vconsoleControll'

import Vant from 'vant'
import 'vant/lib/index.css'
import './style.less'

const vConsoleInstance = initVConsole()
console.info('[H5][Bootstrap] vConsole initialized:', {
  available: Boolean(vConsoleInstance),
  mode: import.meta.env.MODE,
  env: import.meta.env.VITE_ENV || ''
})

window.addEventListener('statusBarReady', () => {
  console.info('[H5][Native] statusBarReady:', {
    height: window.STATUS_BAR_HEIGHT
  })
  document.documentElement.style.setProperty(
    '--status-bar-height',
    window.STATUS_BAR_HEIGHT + 'px'
  )
})

console.info('[H5][Bootstrap] start:', {
  mode: import.meta.env.MODE,
  projectUrl: import.meta.env.VITE_PROJECT_URL || '',
  userAgent: navigator.userAgent
})

const app = createApp(App)
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)

const userStore = useUserStore(pinia)
console.info('[H5][Bootstrap] user store created:', {
  hasToken: Boolean(userStore.token),
  userId: userStore.id || null,
  username: userStore.username || ''
})

registerAuthExpiredHandler(async ({ source, reason }) => {
  console.warn('[H5][Auth] auth expired handler triggered:', {
    source,
    reason
  })

  userStore.clearUserInfo()

  const nativeBridge = window.DXCHAT_NATIVE
  if (typeof nativeBridge?.logout === 'function') {
    try {
      await Promise.resolve(nativeBridge.logout())
    } catch (error) {
      console.error('[H5][Auth] native logout failed:', error)
    }
  }

  if (router.currentRoute.value.path !== '/public-chat') {
    await router.replace('/public-chat')
  }
})

app.use(Vant)
app.use(pinia)
app.use(router)
app.mount('#app')
console.info('[H5][Bootstrap] app mounted')

console.info('[H5][Auth] initAuth begin')
initAuth()
  .then((authResult) => {
    if (authResult?.token) {
      userStore.setAuthSession(authResult.authData, authResult.token, authResult.expire)
    }

    console.info('[H5][Auth] initAuth complete:', {
      handled: Boolean(authResult),
      hasToken: Boolean(authResult?.token || userStore.token),
      userId: userStore.id || null,
      username: userStore.username || ''
    })
  })
  .catch((error) => {
    console.error('[H5][Auth] initAuth failed:', error)
  })
