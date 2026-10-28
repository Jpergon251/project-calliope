import { createRouter, createWebHashHistory } from 'vue-router'

import { useUserStore } from '../stores/userStore.js'

const routes = [
  { path: '/welcome', name: 'Welcome', component: () => import('../components/screens/WelcomeScreen.vue') },
  { path: '/', name: 'Home', component: () => import('../pages/Home.vue') },
  { path: '/library', name: 'Library', component: () => import('../pages/Library.vue') },
  { path: '/library-alias', redirect: (to) => ({ path: '/library', query: to.query }), name: 'library' },
  { path: '/songs', name: 'Songs', component: () => import('../pages/SongsPage.vue') },
  { path: '/albums', name: 'Albums', component: () => import('../pages/AlbumsPage.vue') },
  { path: '/artists', name: 'Artists', component: () => import('../pages/ArtistsPage.vue') },
  { path: '/artist/:name', name: 'artist', component: () => import('../pages/ArtistPage.vue'), props: true },
  { path: '/history', name: 'History', component: () => import('../pages/HistoryPage.vue') },
  { path: '/playlists', name: 'Playlists', component: () => import('../pages/PlaylistsPage.vue') },
  { path: '/favorites', name: 'Favorites', component: () => import('../pages/Playlist.vue'), props: { playlistId: 'favorites' } },
  { path: '/metadata', name: 'Metadata', component: () => import('../pages/MetadataPage.vue') },
  { path: '/about', name: 'About', component: () => import('../pages/About.vue') },
  { path: '/playlist/:playlistId', name: 'playlist', component: () => import('../pages/Playlist.vue'), props: true },
  { path: '/settings', name: 'Settings', component: () => import('../pages/Settings.vue') },
  { path: '/profile', name: 'Profile', component: () => import('../pages/Profile.vue') },
  { path: '/song/:id', name: 'song', component: () => import('../pages/Song.vue') },
  { path: '/album/:id', name: 'album', component: () => import('../pages/AlbumPage.vue'), props: true },
  { path: '/how-to-use', name: 'HowToUse', component: () => import('../pages/HowToUse.vue') },
  { path: '/support', name: 'Support', component: () => import('../pages/SupportPage.vue') },
  { path: '/player', name: 'player', component: () => import('../pages/PlayerPage.vue') },
]

const router = createRouter({
  history: createWebHashHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const user = useUserStore()

  if (!user.loaded) {
    await user.load()
  }

  // 1. Si NO existe una sesión válida, el router debe llevar siempre a /welcome
  if (!user.hasSession) {
    if (to.name !== 'Welcome') {
      return { name: 'Welcome' }
    }
    return true
  }

  // 2. Si existe sesión válida y el usuario intenta acceder a /welcome, llevar a Home
  if (to.name === 'Welcome') {
    return { name: 'Home' }
  }

  return true
})

export default router
