import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import App from './App.vue'



// import HomeMainPage from './components/home.vue'
import test2 from './components/test2.vue'
import articles from './components/articles.vue'
import detailpost from './components/detailpost.vue'
import search from './components/search.vue'

const routes = [
  { path: '/', component: articles },
  { path: '/article', component: test2 },
  { path: '/search', component: search },
  { path: '/post/:id', component: detailpost }
]

const router = createRouter({
  // 4. Provide the history implementation to use. We are using the hash history for simplicity here.
  //createWebHistory() createWebHashHistory
  history: createWebHistory(),
  routes, // short for `routes: routes`
})

createApp(App).use(router).mount('#app')