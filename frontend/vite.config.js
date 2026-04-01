import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  envDir: '../',
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // Se o backend ainda estiver carregando (ECONNREFUSED), 
            // respondemos com 503 (Service Unavailable) para silenciar o erro no terminal do Vite
            if (err.code === 'ECONNREFUSED') {
              if (!res.headersSent) {
                res.writeHead(503, { 'Content-Type': 'text/plain' });
              }
              res.end('Backend starting up...');
              return;
            }
            console.error('proxy error', err);
          });
        },
      },
      '/media': {
        target: 'http://localhost:8001',
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            if (err.code === 'ECONNREFUSED') {
              if (!res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain' });
              res.end('Backend starting up...');
              return;
            }
            console.error('proxy error', err);
          });
        },
      }
    }
  }
})
