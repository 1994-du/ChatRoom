const viewLoaders = {
  PublicChat: () => import('@/views/PublicChat.vue')
}

export const appRoutes = [
  {
    path: '/',
    redirect: '/public-chat'
  },
  {
    path: '/public-chat',
    name: 'PublicChat',
    component: viewLoaders.PublicChat,
    meta: {
      title: '公共聊天',
      showBack: false,
      showHeaderAction: 'online-users'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/public-chat'
  }
]

export default appRoutes
