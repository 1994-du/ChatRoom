const viewLoaders = {
  PublicChat: () => import('@/views/PublicChat.vue')
}

export const appRoutes = [
  {
    path: '/',
    name: 'PublicChat',
    component: viewLoaders.PublicChat,
    meta: {
      title: '公共聊天',
      showBack: true,
      showHeaderAction: 'online-users'
    }
  }
]

export default appRoutes
