import { createApp } from 'vue'
import App from './App.vue'

import '@/style/reset.css'

// 路由
import router from './router'

const app = createApp(App)
app.use(router).mount('#app')
