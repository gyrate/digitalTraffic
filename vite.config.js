import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'
import AutoImport from 'unplugin-auto-import/vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig(({command , mode})=>{
  const env = loadEnv(mode, process.cwd())
  
  return {
    base: env.VITE_APP_BASEURL,
    plugins: [
      vue(),
      AutoImport({
        imports: ['vue', 'vue-router']
      }),
    ],
    resolve: {
      alias: {
        '#': resolve(__dirname, 'submodule'),
        '@': resolve(__dirname, 'src')
      },
      // 忽略后缀名的配置选项, 添加 .vue 选项时要记得原本默认忽略的选项也要手动写入
      extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue']
    }
  }
  
})
