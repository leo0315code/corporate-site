/* ============================================================
   全局常量：路由常量 ROUTES、统一文案 MESSAGES、业务常量
   组件内禁止散写字符串路径与提示文案
   ============================================================ */

/** 路由常量（详情页为函数式路径） */
export const ROUTES = {
  HOME: '/',
  ABOUT: '/about',
  PRODUCTS: '/products',
  PRODUCT_DETAIL: (id: string) => `/products/${id}`,
  NEWS: '/news',
  NEWS_DETAIL: (id: string) => `/news/${id}`,
  CONTACT: '/contact',
} as const;

/** 统一提示文案（前端界面 + 校验反馈） */
export const MESSAGES = {
  SUBMIT_SUCCESS: '提交成功，我们会尽快与您联系',
  SUBMIT_FAIL: '提交失败，请稍后重试',
  NETWORK_ERROR: '网络异常，请检查网络后重试',
  SUBMITTING: '提交中…',
  FORM_PRIVACY: '提交即表示同意我们联系您',
  REQUIRED: '此项为必填',
} as const;

/** 留言表单校验规则（与后端 MessageValidate 保持一致） */
export const VALIDATION = {
  NAME_MIN: 2,
  NAME_MAX: 30,
  COMPANY_MAX: 50,
  CONTENT_MIN: 5,
  CONTENT_MAX: 500,
  /** 手机号：1 开头，第二位 3-9，共 11 位 */
  PHONE_MOBILE_REGEX: /^1[3-9]\d{9}$/,
  /** 座机：区号 0 开头 2-3 位，可选连字符，7-8 位号码 */
  PHONE_TEL_REGEX: /^0\d{2,3}-?\d{7,8}$/,
  /** 邮箱基础正则 */
  EMAIL_REGEX: /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/,
} as const;

/** 业务常量 */
export const APP = {
  /** 首页展示的业务卡片数量 */
  HOME_PRODUCT_LIMIT: 3,
  /** 首页新闻摘要数量 */
  HOME_NEWS_LIMIT: 3,
  /** 新闻列表「加载更多」每次条数 */
  NEWS_PAGE_SIZE: 4,
  /** 提交成功后冷却秒数 */
  COOLDOWN_SECONDS: 30,
  /** API 超时（毫秒） */
  API_TIMEOUT: 10000,
} as const;

/** 错误码（与后端统一定义） */
export const ERROR_CODES = {
  SUCCESS: 0,
  VALIDATE_FAIL: 1001,
  DUPLICATE: 1002,
  /** 未登录 / Token 无效或过期 */
  UNAUTHORIZED: 1003,
  /** 账号或密码错误（防枚举） */
  LOGIN_FAILED: 1004,
  /** 登录失败次数过多，账号/IP 已锁定 */
  ACCOUNT_LOCKED: 1005,
  /** 需要先修改初始密码 */
  NEED_RESET_PWD: 1006,
  /** 原密码错误 */
  OLD_PWD_WRONG: 1007,
  /** 请求过于频繁（限流） */
  TOO_MANY_REQ: 1008,
  NOT_FOUND: 4004,
  SERVER_ERROR: 5000,
} as const;

/** CMS 后台路由 / API 基址配置（VITE_CMS_PATH 必须与后端 CMS_PATH 完全一致） */
export const CMS = {
  /** 后台入口前缀（如 /manage-x7k2；空串=后台关闭） */
  PATH: (import.meta.env.VITE_CMS_PATH || '').replace(/\/$/, ''),
  /** 后台 API 基址（如 /manage-x7k2/api） */
  API_BASE: `${(import.meta.env.VITE_CMS_PATH || '').replace(/\/$/, '')}/api`,
  /** 会话 Token 在 localStorage 的键名 */
  TOKEN_KEY: 'cms_token',
} as const;

/** 后台前端路由（登录后页面；DASHBOARD 即后台根） */
export const CMS_ROUTES = {
  LOGIN: `${CMS.PATH}/login`,
  RESET_PASSWORD: `${CMS.PATH}/reset-password`,
  PASSWORD: `${CMS.PATH}/password`,
  DASHBOARD: CMS.PATH,
  PRODUCTS: `${CMS.PATH}/products`,
  NEWS: `${CMS.PATH}/news`,
  CASES: `${CMS.PATH}/cases`,
  ADVANTAGES: `${CMS.PATH}/advantages`,
  ABOUT: `${CMS.PATH}/about`,
  SITE: `${CMS.PATH}/site`,
  MESSAGES: `${CMS.PATH}/messages`,
  ACCOUNTS: `${CMS.PATH}/accounts`,
  OPLOGS: `${CMS.PATH}/oplogs`,
} as const;

/** 后台统一文案（后端错误码 → 兜底中文；页面优先展示后端 message） */
export const CMS_MESSAGES = {
  [ERROR_CODES.UNAUTHORIZED]: '登录已过期，请重新登录',
  [ERROR_CODES.LOGIN_FAILED]: '账号或密码错误',
  [ERROR_CODES.ACCOUNT_LOCKED]: '登录失败次数过多，请稍后再试',
  [ERROR_CODES.NEED_RESET_PWD]: '请先修改初始密码',
  [ERROR_CODES.OLD_PWD_WRONG]: '原密码错误',
  [ERROR_CODES.TOO_MANY_REQ]: '请求过于频繁，请稍后再试',
  [ERROR_CODES.VALIDATE_FAIL]: '提交内容不合法',
  [ERROR_CODES.NOT_FOUND]: '资源不存在',
  [ERROR_CODES.SERVER_ERROR]: '服务器开小差了，请稍后重试',
  TOKEN_MISSING: '请先登录',
} as const;

/** 后台列表可选每页条数 */
export const CMS_PAGE_SIZES = [10, 20, 50] as const;

/* ============================================================
   操作日志（只读审计流水，C-P1-3）
   模块 / 动作 / 结果 枚举值与中文映射（与后端 PRD §4.2/§4.3 冻结值一致）
   ============================================================ */

/** 模块枚举（前端筛选用；顺序即下拉展示顺序） */
export const OPLOG_MODULES = [
  'auth',
  'product',
  'news',
  'case',
  'advantage',
  'about',
  'site',
  'message',
  'account',
  'upload',
] as const;

/** 动作枚举（前端筛选用） */
export const OPLOG_ACTIONS = [
  'login',
  'logout',
  'create',
  'update',
  'delete',
  'enable',
  'disable',
  'reset_password',
  'change_password',
  'upload',
] as const;

/** 结果枚举（前端筛选用） */
export const OPLOG_RESULTS = [1, 0] as const;

/** 模块 → 中文标签 */
export const OPLOG_MODULE_LABELS: Record<string, string> = {
  auth: '认证',
  product: '产品管理',
  news: '新闻管理',
  case: '案例管理',
  advantage: '优势管理',
  about: '关于我们',
  site: '网站配置',
  message: '留言管理',
  account: '账号管理',
  upload: '图片上传',
};

/** 动作 → 中文标签 */
export const OPLOG_ACTION_LABELS: Record<string, string> = {
  login: '登录',
  logout: '登出',
  create: '新增',
  update: '编辑',
  delete: '删除',
  enable: '启用',
  disable: '停用',
  reset_password: '重置密码',
  change_password: '修改密码',
  upload: '上传',
};

/** 结果 → 中文标签 */
export const OPLOG_RESULT_LABELS: Record<number, string> = {
  1: '成功',
  0: '失败',
};

/** 取模块中文标签（未知值回退原文，避免展示空白） */
export function oplogModuleLabel(module: string): string {
  return OPLOG_MODULE_LABELS[module] ?? module;
}

/** 取动作中文标签（未知值回退原文） */
export function oplogActionLabel(action: string): string {
  return OPLOG_ACTION_LABELS[action] ?? action;
}

/** 取结果中文标签（未知值回退原文） */
export function oplogResultLabel(result: number): string {
  return OPLOG_RESULT_LABELS[result] ?? String(result);
}

/**
 * 图片上传约束（前端**预检**用，最终以后端为准）
 *
 * 与后端 `UploadService::MAX_SIZE` / `MIME_EXT_MAP` 保持一致：
 * 后端会以 finfo 探测真实 MIME 并做「MIME ↔ 扩展名」交叉校验。
 * 前端此处仅做快速反馈，减少无效请求。
 */
export const UPLOAD = {
  /** 单文件最大字节数：5MB */
  MAX_SIZE: 5 * 1024 * 1024,
  /** 允许的扩展名（小写，含点） */
  ACCEPT_EXT: ['.jpg', '.jpeg', '.png', '.webp', '.svg', '.gif'] as const,
  /** <input accept> 的值 */
  ACCEPT_ATTR: '.jpg,.jpeg,.png,.webp,.svg,.gif',
  /** 文案提示 */
  HINT: '支持 jpg / png / webp / svg / gif，单张不超过 5MB',
} as const;

/**
 * 后台内容 id 前缀（自动生成的 id 形如 `product-20261017-a3f9`）
 *
 * 说明：`id` 是前台详情页 URL 的一部分（`/products/:id`、`/news/:id`），
 * 因此**编辑时永不修改既有 id**，仅新增时可自动生成或手动指定。
 */
export const ID_PREFIX = {
  product: 'product',
  news: 'news',
  case: 'case',
} as const;
