import { createRouter, createWebHistory } from 'vue-router'
import Home from '../pages/Home.vue'
import Library from '../pages/Library.vue'
import Playlist from '../pages/Playlist.vue'
import Settings from '../pages/Settings.vue'


const routes = [
  { path: '/', name: 'Home', component: Home },
  {path: '/library',name: 'Library',component: Library},
  {path: '/playlist/:playlistId', name: 'playlist', component: Playlist, props: true},
  {path: '/settings',name:'Settings', component: Settings}

]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router