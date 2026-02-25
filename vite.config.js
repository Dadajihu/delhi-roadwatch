import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/sightengine': {
        target: 'https://api.sightengine.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/sightengine/, '')
      },
      '/api/roboflow': {
        target: 'https://serverless.roboflow.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/roboflow/, '')
      }
    }
  }
})
