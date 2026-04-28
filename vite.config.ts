import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Project site: https://sethhyatt8.github.io/emily/ — production needs repo base path.
  base: command === 'build' ? '/emily/' : '/',
  plugins: [react()],
}))
