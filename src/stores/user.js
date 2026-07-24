import { defineStore } from 'pinia'
import wsService from '@/utils/websocket'
import { removeToken, setToken } from '@/utils/token'
import { resolveUserProfile } from '@/utils/userProfile'

export const useUserStore = defineStore('user', {
  state: () => ({
    id: null,
    avatar: '',
    token: '',
    username: '',
    profileReady: false,
    menus: [],
    gender: null,
    roleId: null,
    roleName: ''
  }),
  getters: {
    getToken: (state) => state.token,
    getAvatar: (state) => state.avatar,
    getUsername: (state) => state.username
  },
  actions: {
    setAuthSession(authData, token = '', expire = null) {
      const profile = resolveUserProfile(authData, this)

      this.id = profile.userId
      this.avatar = profile.avatar
      this.username = profile.username
      this.gender = profile.gender
      this.roleId = profile.roleId
      this.roleName = profile.roleName
      this.menus = profile.menus
      this.profileReady = false
      this.token = token || this.token || ''

      if (this.token) {
        setToken(this.token, expire)
      }
    },
    setUserInfo(info) {
      console.log('设置用户信息:', info)
      if (!info) {
        return
      }

      const profile = resolveUserProfile(info, this)
      const token = info?.data?.token || info?.token || info?.data?.accessToken || info?.accessToken || this.token || ''
      const expire = info?.data?.expire || info?.data?.expiresAt || info?.expire || info?.expiresAt || null

      this.id = profile.userId
      this.avatar = profile.avatar
      this.token = token
      this.username = profile.username
      this.gender = profile.gender
      this.roleId = profile.roleId
      this.roleName = profile.roleName
      this.menus = profile.menus
      this.profileReady = true

      if (this.token) {
        setToken(this.token, expire)
      }
    },
    clearUserInfo() {
      // 退出登录前断开 WebSocket 连接并发送下线通知
      wsService.close()

      this.id = null
      this.avatar = ''
      this.token = ''
      this.username = ''
      this.profileReady = false
      this.menus = []
      this.gender = null
      this.roleId = null
      this.roleName = ''
      removeToken()
    }
  },
  persist: {
    key: 'user-info',
    storage: localStorage,
    paths: ['id', 'avatar', 'token', 'username', 'menus', 'gender', 'roleId', 'roleName']
  }
})
