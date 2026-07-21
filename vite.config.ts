import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { handleLocalAdminApi } from './scripts/local-admin-api'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/family-health-medicine-box/' : '/',
  plugins: [
    react(),
    {
      name: 'local-admin-api',
      configureServer(server) {
        server.middlewares.use('/api/admin', (req, res) => {
          void handleLocalAdminApi(req, res)
        })
      },
    },
  ],
})
