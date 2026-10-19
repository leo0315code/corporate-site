/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** API 基础地址，默认 /api */
  readonly VITE_API_BASE: string;
  /** CMS 后台入口前缀（须与后端 CMS_PATH 一致，如 /manage-x7k2） */
  readonly VITE_CMS_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
