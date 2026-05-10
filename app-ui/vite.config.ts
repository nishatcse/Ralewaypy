import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist/renderer',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@renderer': path.resolve(__dirname, './src/renderer'),
            '@shared': path.resolve(__dirname, './src/shared'),
        },
    },
    server: {
        port: 3000,
        strictPort: true,
    },
});
