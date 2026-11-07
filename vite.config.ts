import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Never deployed: the keys live in the bundle. Bind to localhost only.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: { host: '127.0.0.1', port: 5174 },
  define: { 'process.env': {} },
});
