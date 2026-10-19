import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Vite 配置：React 插件 + 开发期代理到 ThinkPHP 后端（8000）
// - /api                        → 前台公共接口
// - {VITE_CMS_PATH}/api         → 后台管理接口（仅当 VITE_CMS_PATH 非空）
// - /uploads                    → 后台用户上传的图片静态资源
// 说明：仅代理 {CMS_PATH}/api；{CMS_PATH}/login 等页面路由仍由 Vite SPA 处理。
// package.json 为 "type": "module"，故用 import.meta.url 解析路径（而非 __dirname）。
// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 载入全部环境变量（含无前缀变量），读取 VITE_CMS_PATH
  const env = loadEnv(mode, process.cwd(), '');
  const cmsPath = (env.VITE_CMS_PATH || '').replace(/\/$/, '');

  // 基础代理：/api → 后端；/uploads → 后端上传目录（开发期图片可正常回显）
  const proxy: Record<string, { target: string; changeOrigin: boolean }> = {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
    '/uploads': {
      target: 'http://localhost:8000',
      changeOrigin: true,
    },
  };

  // 仅当 CMS_PATH 已配置时，追加后台 API 代理
  if (cmsPath !== '') {
    proxy[`${cmsPath}/api`] = {
      target: 'http://localhost:8000',
      changeOrigin: true,
    };
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        // 统一使用 @ 指向 src，避免深层相对路径
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: true,
      proxy,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
    },
  };
});
