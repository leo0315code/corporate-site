import { APP, CMS, ERROR_CODES, MESSAGES } from '@/constants';
import type {
  AboutData,
  AdvantageItem,
  ApiResponse,
  CaseItem,
  HomeSummary,
  ListQuery,
  MessagePayload,
  NewsDetailData,
  NewsItem,
  PagedData,
  Product,
  SiteConfigData,
} from '@/types';

/**
 * 业务错误：携带后端返回的 code 与 message，便于表单直接展示 message。
 */
export class ApiError extends Error {
  /** 业务错误码（0 为成功，不会抛出） */
  public readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/** 默认 API 基础地址，来自环境变量 VITE_API_BASE，默认 /api */
const DEFAULT_BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

/** request 可选项：自定义 base 与显式 token */
export interface RequestOptions {
  /** API 基址前缀（默认 /api；后台传 CMS.API_BASE） */
  base?: string;
  /** 会话 Token；传入时注入 Authorization: Bearer <token> */
  token?: string | null;
}

/**
 * 带超时的 fetch 封装：
 * - 统一 Content-Type: application/json
 * - 通过 AbortController 实现超时
 * - 归一化网络异常与 JSON 解析异常为 ApiError（网络错误文案）
 *
 * 注意（重要）：后端对未命中路由返回**真 HTTP 404 + 合法 JSON 体**。
 * 此处**只**解析 JSON 体、**不**检查 `response.ok`，以保证错误码（如 4004）
 * 能被正常解析并向上抛出，避免破坏错误码语义。
 *
 * @param path 相对路径（如 /message 或 /content/product/list）
 * @param init fetch 初始化配置
 * @param opts 可选：自定义 base 与 token
 * @returns 解析后的 JSON（统一响应结构）
 */
async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const base = (opts.base ?? DEFAULT_BASE).replace(/\/$/, '');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), APP.API_TIMEOUT);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };

  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch {
    // 网络异常 / 超时（AbortError）统一归一化
    window.clearTimeout(timer);
    throw new ApiError(ERROR_CODES.SERVER_ERROR, MESSAGES.NETWORK_ERROR);
  } finally {
    window.clearTimeout(timer);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    // JSON 解析失败，视为服务器异常
    throw new ApiError(ERROR_CODES.SERVER_ERROR, MESSAGES.NETWORK_ERROR);
  }

  return payload;
}

/**
 * 统一响应解析：code===0 返回 data，否则抛出携带 message 的 ApiError。
 * @param payload 统一响应结构
 * @returns 业务数据
 */
function unwrap<T>(payload: ApiResponse<T>): T {
  if (payload.code !== ERROR_CODES.SUCCESS) {
    throw new ApiError(payload.code, payload.message || MESSAGES.SUBMIT_FAIL);
  }
  return payload.data as T;
}

/* ============================================================
   前台：留言提交
   ============================================================ */

/**
 * 提交留言（POST /api/message）
 * @param payload 留言数据（company 选填）
 * @returns 成功时返回 true
 * @throws ApiError 业务失败或网络异常
 */
export async function submitMessage(payload: MessagePayload): Promise<boolean> {
  const body: MessagePayload = {
    name: payload.name.trim(),
    company: (payload.company ?? '').trim(),
    phone: (payload.phone ?? '').trim(),
    email: (payload.email ?? '').trim(),
    content: payload.content.trim(),
  };

  const result = await request<null>('/message', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  unwrap<null>(result);
  return true;
}

/* ============================================================
   前台：内容读取（匿名，走 /api）
   ------------------------------------------------------------
   模块级内存缓存（TTL 60s）仅包裹内容 GET；后台保存后请调用 clearContentCache()
   以使「刷新即生效」。
   ============================================================ */

/** 内容缓存项 */
interface CacheEntry {
  data: unknown;
  expireAt: number;
}

/** 内容 GET 内存缓存 */
const contentCache = new Map<string, CacheEntry>();

/** 内容缓存 TTL（毫秒），与后端 Cache-Control max-age=60 对齐 */
const CONTENT_CACHE_TTL = 60_000;

/**
 * 读取缓存（过期即失效并清除）
 * @param key 缓存键
 * @returns 命中返回数据，否则 null
 */
function readCache<T>(key: string): T | null {
  const entry = contentCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() >= entry.expireAt) {
    contentCache.delete(key);
    return null;
  }
  return entry.data as T;
}

/**
 * 写入缓存
 * @param key 缓存键
 * @param data 数据
 */
function writeCache(key: string, data: unknown): void {
  contentCache.set(key, { data, expireAt: Date.now() + CONTENT_CACHE_TTL });
}

/**
 * 在途请求表：同一 key 的并发调用共享同一个 Promise。
 *
 * 必要性：缓存只在请求**完成后**写入，若同一 key 在完成前被并发调用两次
 * （典型场景：React 18 `StrictMode` 在开发模式故意两次调用 effect，
 * 或两个组件同时挂载读取同一资源），两次都会读到空缓存并**各发一次真实请求**，
 * 造成重复网络开销。此处以「在途 Promise」做去重，使后续调用直接复用在途结果。
 */
const inflight = new Map<string, Promise<unknown>>();

/**
 * 缓存代际：`clearContentCache()` 时自增。
 *
 * 用于丢弃「清理前发起、清理后才返回」的在途请求写入，
 * 避免旧的响应在清理后重新污染缓存（保障后台保存后的「刷新即生效」）。
 */
let cacheEpoch = 0;

/** 清空内容缓存与在途请求（后台保存成功后调用，确保「刷新即生效」） */
export function clearContentCache(): void {
  contentCache.clear();
  inflight.clear();
  cacheEpoch += 1;
}

/**
 * 内容 GET 带缓存执行器（含在途去重）
 *
 * 命中顺序：① 已完成的缓存 → 直接返回；② 同 key 的在途请求 → 复用其 Promise；
 * ③ 都没有 → 发起真实请求，并登记到在途表，完成后写缓存。
 *
 * @param key 缓存键
 * @param loader 实际加载函数
 * @returns 数据
 */
async function withContentCache<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const cached = readCache<T>(key);
  if (cached !== null) {
    return cached;
  }

  const pending = inflight.get(key) as Promise<T> | undefined;
  if (pending !== undefined) {
    return pending;
  }

  const epoch = cacheEpoch;
  const task = (async (): Promise<T> => {
    try {
      const data = await loader();
      // 仅当期间未被 clearContentCache() 清理时才写缓存
      if (epoch === cacheEpoch) {
        writeCache(key, data);
      }
      return data;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

/**
 * 内容 GET 的 fetch 初始化：`cache: 'no-store'`。
 *
 * 背景（重要）：后端内容读接口会返回 `Cache-Control: public, max-age=60`。
 * 若浏览器复用该 HTTP 缓存，则后台保存后**刷新前台**可能仍命中最多 60s 的旧响应，
 * 破坏「刷新即生效」这一 P0 要求。
 *
 * 由于本模块已用上面的 60s 内存缓存（`contentCache`）承担去重，
 * 且后台保存成功后会 `clearContentCache()`，故内容 GET **显式绕过浏览器 HTTP 缓存**，
 * 让「应用内存缓存」成为唯一的事实来源，保证刷新即取最新。
 */
const NO_STORE: RequestInit = { cache: 'no-store' };

/**
 * 将 ListQuery 转为查询串（忽略空值）
 * @param q 查询参数
 * @returns 形如 `?page=1&size=10` 的字符串（无参数时为空串）
 */
function buildQuery(q?: ListQuery): string {
  if (!q) {
    return '';
  }
  const params = new URLSearchParams();
  if (q.page !== undefined) {
    params.set('page', String(q.page));
  }
  if (q.size !== undefined) {
    params.set('size', String(q.size));
  }
  if (q.keyword) {
    params.set('keyword', q.keyword);
  }
  if (q.category) {
    params.set('category', q.category);
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

/**
 * 产品列表（GET /api/product/list）
 * @param q 分页 / 关键词 / 分类
 * @returns 分页产品数据
 */
export async function fetchProductList(q?: ListQuery): Promise<PagedData<Product>> {
  const key = `product/list${buildQuery(q)}`;
  return withContentCache(key, async () => {
    const result = await request<PagedData<Product>>(`/product/list${buildQuery(q)}`, NO_STORE);
    return unwrap<PagedData<Product>>(result);
  });
}

/**
 * 产品详情（GET /api/product/detail?id=）
 * @param id 产品 id
 * @returns 产品
 */
export async function fetchProductDetail(id: string): Promise<Product> {
  const key = `product/detail?id=${id}`;
  return withContentCache(key, async () => {
    const result = await request<Product>(`/product/detail?id=${encodeURIComponent(id)}`, NO_STORE);
    return unwrap<Product>(result);
  });
}

/**
 * 新闻列表（GET /api/news/list）
 * @param q 分页 / 关键词 / 分类
 * @returns 分页新闻数据
 */
export async function fetchNewsList(q?: ListQuery): Promise<PagedData<NewsItem>> {
  const key = `news/list${buildQuery(q)}`;
  return withContentCache(key, async () => {
    const result = await request<PagedData<NewsItem>>(`/news/list${buildQuery(q)}`, NO_STORE);
    return unwrap<PagedData<NewsItem>>(result);
  });
}

/**
 * 新闻详情（GET /api/news/detail?id=，含上一篇/下一篇）
 * @param id 新闻 id
 * @returns NewsDetailData
 */
export async function fetchNewsDetail(id: string): Promise<NewsDetailData> {
  const key = `news/detail?id=${id}`;
  return withContentCache(key, async () => {
    const result = await request<NewsDetailData>(`/news/detail?id=${encodeURIComponent(id)}`, NO_STORE);
    return unwrap<NewsDetailData>(result);
  });
}

/**
 * 案例列表（GET /api/case/list，全量）
 * @returns { items: CaseItem[] }
 */
export async function fetchCaseList(): Promise<{ items: CaseItem[] }> {
  const key = 'case/list';
  return withContentCache(key, async () => {
    const result = await request<{ items: CaseItem[] }>('/case/list', NO_STORE);
    return unwrap<{ items: CaseItem[] }>(result);
  });
}

/**
 * 优势列表（GET /api/advantage/list，全量，含 id）
 * @returns { items: AdvantageItem[] }
 */
export async function fetchAdvantageList(): Promise<{ items: AdvantageItem[] }> {
  const key = 'advantage/list';
  return withContentCache(key, async () => {
    const result = await request<{ items: AdvantageItem[] }>('/advantage/list', NO_STORE);
    return unwrap<{ items: AdvantageItem[] }>(result);
  });
}

/**
 * 关于我们（GET /api/about/detail，单例）
 * @returns AboutData
 */
export async function fetchAbout(): Promise<AboutData> {
  const key = 'about/detail';
  return withContentCache(key, async () => {
    const result = await request<AboutData>('/about/detail', NO_STORE);
    return unwrap<AboutData>(result);
  });
}

/**
 * 网站配置（GET /api/site/config，单例）
 *
 * 返回**仅业务字段**（companyName / logo / slogan / description / contact / footer / seo），
 * 不含 `nav` / `theme` / `footer.quickLinks`——这三项由前端静态配置提供，
 * 由 `SiteConfigProvider` 合并成完整 `SiteConfig`。
 *
 * @returns SiteConfigData
 */
export async function fetchSiteConfig(): Promise<SiteConfigData> {
  const key = 'site/config';
  return withContentCache(key, async () => {
    const result = await request<SiteConfigData>('/site/config', NO_STORE);
    return unwrap<SiteConfigData>(result);
  });
}

/**
 * 首页聚合（GET /api/home/summary）
 * @param productLimit 产品条数（默认后端 3）
 * @param newsLimit 新闻条数（默认后端 3）
 * @returns HomeSummary
 */
export async function fetchHomeSummary(
  productLimit?: number,
  newsLimit?: number,
): Promise<HomeSummary> {
  const params = new URLSearchParams();
  if (productLimit !== undefined) {
    params.set('productLimit', String(productLimit));
  }
  if (newsLimit !== undefined) {
    params.set('newsLimit', String(newsLimit));
  }
  const qs = params.toString();
  const suffix = qs ? `?${qs}` : '';
  const key = `home/summary${suffix}`;

  return withContentCache(key, async () => {
    const result = await request<HomeSummary>(`/home/summary${suffix}`, NO_STORE);
    return unwrap<HomeSummary>(result);
  });
}

/* ============================================================
   供后台（cms.ts）复用的底层请求原语
   ============================================================ */

/**
 * 带鉴权的后台请求（base = CMS.API_BASE）
 *
 * 供 `services/cms.ts` 调用；不在此处捕获认证错误（由 cms.ts 统一分流），
 * 以便业务层拿到原始 ApiError。
 *
 * @param path 相对后台 API 的路径（如 /content/product/list）
 * @param init fetch 配置
 * @param token 会话 Token
 * @returns 统一响应结构
 */
export function cmsRequest<T>(
  path: string,
  init: RequestInit = {},
  token?: string | null,
): Promise<ApiResponse<T>> {
  return request<T>(path, init, { base: CMS.API_BASE, token });
}

/**
 * 解析统一响应（供 cms.ts 复用）
 * @param payload 统一响应结构
 * @returns 业务数据
 */
export function cmsUnwrap<T>(payload: ApiResponse<T>): T {
  return unwrap<T>(payload);
}

/**
 * 带鉴权的后台上传请求（multipart/form-data，base = CMS.API_BASE）
 *
 * 与 `cmsRequest` 的**关键差异**：**绝不设置 `Content-Type`**，
 * 交由浏览器为 `FormData` 自动生成带 boundary 的
 * `multipart/form-data; boundary=…`；若手工写死会因缺少 boundary 导致后端解析失败。
 *
 * 仍复用与 `request` 相同的超时、网络异常归一化与 JSON 解析策略。
 *
 * @param path 相对后台 API 的路径（如 /upload/image）
 * @param form 表单数据（含文件与附加字段）
 * @param token 会话 Token
 * @returns 统一响应结构
 */
export async function cmsUpload<T>(
  path: string,
  form: FormData,
  token?: string | null,
): Promise<ApiResponse<T>> {
  const base = CMS.API_BASE.replace(/\/$/, '');
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), APP.API_TIMEOUT);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: 'POST',
      body: form,
      headers,
      signal: controller.signal,
    });
  } catch {
    window.clearTimeout(timer);
    throw new ApiError(ERROR_CODES.SERVER_ERROR, MESSAGES.NETWORK_ERROR);
  } finally {
    window.clearTimeout(timer);
  }

  let payload: ApiResponse<T>;
  try {
    payload = (await response.json()) as ApiResponse<T>;
  } catch {
    throw new ApiError(ERROR_CODES.SERVER_ERROR, MESSAGES.NETWORK_ERROR);
  }

  return payload;
}
