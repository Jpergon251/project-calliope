import { createRouter, createWebHistory } from 'vue-router'
import { useLibraryStore } from '../stores/libraryStore.js'
import Home from '../pages/Home.vue'
import Library from '../pages/Library.vue'
import Playlist from '../pages/Playlist.vue'
import Settings from '../pages/Settings.vue'
import Song from '../pages/Song.vue'
import AlbumPage from '../pages/AlbumPage.vue'
import SongsPage from '../pages/SongsPage.vue'
import AlbumsPage from '../pages/AlbumsPage.vue'
import About from '../pages/About.vue'
import Support from '../pages/SupportPage.vue'
import HowToUse from '../pages/HowToUse.vue'

const routes = [
  {path: '/', name: 'Home', component: Home },
  {path: '/library',name: 'Library',component: Library},
  {path: "/songs", name: "Songs", component: SongsPage },
  {path: "/albums", name: "Albums", component: AlbumsPage },
  {path: '/about', name: 'About', component: About},
  {path: '/playlist/:playlistId', name: 'playlist', component: Playlist, props: true},
  {path: '/settings',name:'Settings', component: Settings},
  {path: '/song/:id',name: 'song', component: Song, props: true},
  {path: '/album/:id',name: 'album', component: AlbumPage, props: true},
  {path: '/how-to-use', name: 'HowToUse', component: HowToUse},
  {path: '/support', name: 'Support', component: Support},

]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to) => {

  const library = useLibraryStore();

  if (
    library.initialized &&
    !library.folderHandle &&
    !["Home", "About"].includes(to.name)
  ) {
    return { name: "Home" };
  }
});

export default router
