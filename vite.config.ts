import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // IMPORTANT: This 'base' path is set to match your GitHub repository name.
  base: "/DailyKitchenMadness/"
})