import { defineStore } from 'pinia'
import wsService from '@/utils/websocket'
import { removeToken, setToken } from '@/utils/token'
import { resolveUserProfile } from '@/utils/userProfile'

export const useUserStore = defineStore('user', {
  state: () => ({
    id: null,
    avatar: '',
    token: '',
    username: ''
  }),
  getters: {
    getToken: (state) => state.token,
    getAvatar: (state) => state.avatar,
    getUsername: (state) => state.username
  },
  actions: {
    setAuthSession(authData, token = '', expire = null) {
      const profile = resolveUserProfile(authData, this)
      const userId = profile.userId ?? null
      const username = profile.username || (userId !== null ? `用户${userId}` : '')

      this.id = userId
      this.avatar = profile.avatar
      this.username = username
      this.token = token || this.token || ''

      if (this.token) {
        setToken(this.token, expire)
      }
    },
    clearUserInfo() {
      wsService.close()

      this.id = null
      this.avatar = ''
      this.token = ''
      this.username = ''
      removeToken()
    }
  },
  persist: {
    key: 'user-info',
    storage: localStorage,
    paths: ['id', 'avatar', 'token', 'username']
  }
})
