import { clearContentCache, cmsRequest, cmsUnwrap, cmsUpload, ApiError } from '@/services/api';
import { clearToken, getToken, handleAuthError } from '@/utils/authToken';
import type {
  AboutData,
  AdminCredentialResult,
  AdminListData,
  AdminProfile,
  ChangePasswordPayload,
  ImageUploadResult,
  ListQuery,
  LoginPayload,
  LoginResult,
  MessageListAdminData,
  MessageRecordAdmin,
  OpLogItem,
  OpLogListData,
  OpLogQuery,
  PagedData,
  ResetPasswordPayload,
  SiteConfigData,
  UploadType,
} from '@/types';

/**
 * 后台管理 API 客户端（全部走 `CMS.API_BASE`，登录态由 Token 注入）。
 *
 * 设计要点：
 * - 统一在 `guard()` 内捕获 `ApiError` → 调用 `handleAuthError` 分流
 *   （1003 跳登录、1006 跳强制改密）；**未被分流**的错误继续向上抛，供页面展示 message。
 * - 内容保存 / 删除成功后调用 `clearContentCache()`，保证前台「刷新即生效」。
 * - Token 不写入 URL / 日志；仅通过 `Authorization` 头传递。
 */

/** 内容类型（后台接口路径片段） */
export type ContentType = 'product' | 'news' | 'case' | 'advantage';

/** 统一鉴权错误分流：命中 1003/1006 会触发跳转，随后重新抛出以结束当前流程 */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    // handleAuthError 命中会跳转（1003/1006）并返回 true；无论是否命中都向上抛
    handleAuthError(err);
    throw err;
  }
}

/* ============================================================
   认证
   ============================================================ */

/**
 * 登录（POST {P}/api/login）
 * @param payload 账号密码
 * @returns LoginResult（含 token 与 must_change_password）
 */
export async function login(payload: LoginPayload): Promise<LoginResult> {
  return guard(async () => {
    const res = await cmsRequest<LoginResult>(
      '/login',
      { method: 'POST', body: JSON.stringify(payload) },
      null,
    );
    return cmsUnwrap<LoginResult>(res);
  });
}

/**
 * 登出（POST {P}/api/logout）
 */
export async function logout(): Promise<void> {
  try {
    const res = await cmsRequest<null>(
      '/logout',
      { method: 'POST' },
      getToken(),
    );
    cmsUnwrap<null>(res);
  } catch (err) {
    // 登出失败不阻断本地清理：忽略错误，但仍清除本地 Token
    void err;
  } finally {
    clearToken();
  }
}

/**
 * 当前管理员资料（GET {P}/api/profile）
 * @returns AdminProfile
 */
export async function fetchProfile(): Promise<AdminProfile> {
  return guard(async () => {
    const res = await cmsRequest<AdminProfile>('/profile', { method: 'GET' }, getToken());
    return cmsUnwrap<AdminProfile>(res);
  });
}

/**
 * 首次强制改密（POST {P}/api/reset-password）
 * @param payload 新密码 + 确认
 */
export async function resetPassword(payload: ResetPasswordPayload): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/reset-password',
      { method: 'POST', body: JSON.stringify(payload) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/**
 * 常规改密（POST {P}/api/password）
 * @param payload 原密码 + 新密码 + 确认
 */
export async function changePassword(payload: ChangePasswordPayload): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/password',
      { method: 'POST', body: JSON.stringify(payload) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/* ============================================================
   内容管理（列表 / 保存 / 删除）
   ============================================================ */

/**
 * 内容列表（GET {P}/api/content/{type}/list）
 * @param type 内容类型
 * @param q 分页 / 关键词 / 分类
 * @returns 分页数据
 */
export async function listContent<T>(
  type: ContentType,
  q?: ListQuery,
): Promise<PagedData<T>> {
  return guard(async () => {
    const params = new URLSearchParams();
    if (q?.page !== undefined) {
      params.set('page', String(q.page));
    }
    if (q?.size !== undefined) {
      params.set('size', String(q.size));
    }
    if (q?.keyword) {
      params.set('keyword', q.keyword);
    }
    if (q?.category) {
      params.set('category', q.category);
    }
    const qs = params.toString();

    const res = await cmsRequest<PagedData<T>>(
      `/content/${type}/list${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<PagedData<T>>(res);
  });
}

/**
 * 内容保存（POST {P}/api/content/{type}/save）
 * @param type 内容类型
 * @param data 保存载荷
 * @returns 保存后的实体
 */
export async function saveContent<T>(
  type: ContentType,
  data: unknown,
): Promise<T> {
  return guard(async () => {
    const res = await cmsRequest<T>(
      `/content/${type}/save`,
      { method: 'POST', body: JSON.stringify(data) },
      getToken(),
    );
    const saved = cmsUnwrap<T>(res);
    // 保存成功后清内容缓存，保证前台刷新即生效
    clearContentCache();
    return saved;
  });
}

/**
 * 内容删除（POST {P}/api/content/{type}/delete）
 * @param type 内容类型
 * @param id 主键（slug 字符串或 advantage 自增数字）
 */
export async function deleteContent(type: ContentType, id: string | number): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      `/content/${type}/delete`,
      { method: 'POST', body: JSON.stringify({ id }) },
      getToken(),
    );
    cmsUnwrap<null>(res);
    clearContentCache();
  });
}

/* ============================================================
   关于我们（单例整页读写）
   ============================================================ */

/**
 * 读取关于我们（GET {P}/api/content/about/detail，单例）
 * @returns AboutData（含 intro/vision/mission/values/timeline/abilities）
 */
export async function fetchAboutDetail(): Promise<AboutData> {
  return guard(async () => {
    const res = await cmsRequest<AboutData>(
      '/content/about/detail',
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<AboutData>(res);
  });
}

/**
 * 保存关于我们（POST {P}/api/content/about/save，单例 upsert）
 * @param data 整页数据（**不带 id**，由后端固定写 id=1）
 * @returns 保存后的 AboutData
 */
export async function saveAbout(data: AboutData): Promise<AboutData> {
  return guard(async () => {
    const res = await cmsRequest<AboutData>(
      '/content/about/save',
      { method: 'POST', body: JSON.stringify(data) },
      getToken(),
    );
    const saved = cmsUnwrap<AboutData>(res);
    // 关于我们保存成功后清内容缓存，保证前台「刷新即生效」
    clearContentCache();
    return saved;
  });
}

/* ============================================================
   网站配置（单例整页读写）
   ============================================================ */

/**
 * 读取网站配置（GET {P}/api/content/site/detail，单例）
 *
 * 返回的业务字段与前台 `GET /api/site/config` **完全一致**（同一 Service 方法），
 * 区别仅在于走后台鉴权路径。
 *
 * @returns SiteConfigData（不含 nav / theme / footer.quickLinks）
 */
export async function fetchSiteDetail(): Promise<SiteConfigData> {
  return guard(async () => {
    const res = await cmsRequest<SiteConfigData>(
      '/content/site/detail',
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<SiteConfigData>(res);
  });
}

/**
 * 保存网站配置（POST {P}/api/content/site/save，单例 upsert id=1）
 *
 * 请求体的 `nav` / `theme` / `footer.quickLinks` 会被后端白名单丢弃
 * （这三项由前端静态配置提供），因此页面只需提交业务字段。
 *
 * @param data 整页数据（SiteConfigData）
 * @returns 保存后的 SiteConfigData
 */
export async function saveSiteDetail(data: SiteConfigData): Promise<SiteConfigData> {
  return guard(async () => {
    const res = await cmsRequest<SiteConfigData>(
      '/content/site/save',
      { method: 'POST', body: JSON.stringify(data) },
      getToken(),
    );
    const saved = cmsUnwrap<SiteConfigData>(res);
    // 保存成功后清内容缓存，保证前台「刷新即生效」（站点配置亦走同一缓存）
    clearContentCache();
    return saved;
  });
}

/* ============================================================
   留言管理
   ============================================================ */

/**
 * 留言详情（GET {P}/api/message/detail?id=）
 * @param id 留言 ID
 * @returns 单条留言（admin 结构，含 status/handled_at/ip）
 */
export async function fetchMessageDetail(id: number): Promise<MessageRecordAdmin> {
  return guard(async () => {
    const res = await cmsRequest<MessageRecordAdmin>(
      `/message/detail?id=${encodeURIComponent(String(id))}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<MessageRecordAdmin>(res);
  });
}

/**
 * 留言列表（GET {P}/api/message/list）
 * @param q 分页 + keyword；status 作为扩展参数透传
 * @returns 分页留言数据
 */
export async function fetchMessageList(
  q?: ListQuery & { status?: number },
): Promise<MessageListAdminData> {
  return guard(async () => {
    const params = new URLSearchParams();
    if (q?.page !== undefined) {
      params.set('page', String(q.page));
    }
    if (q?.size !== undefined) {
      params.set('size', String(q.size));
    }
    if (q?.keyword) {
      params.set('keyword', q.keyword);
    }
    if (q?.status !== undefined) {
      params.set('status', String(q.status));
    }
    const qs = params.toString();

    const res = await cmsRequest<MessageListAdminData>(
      `/message/list${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<MessageListAdminData>(res);
  });
}

/**
 * 标记留言处理状态（POST {P}/api/message/status）
 * @param id 留言 ID
 * @param status 0=待处理 1=已处理
 */
export async function markMessageStatus(id: number, status: number): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/message/status',
      { method: 'POST', body: JSON.stringify({ id, status }) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/**
 * 删除留言（POST {P}/api/message/delete）
 * @param id 留言 ID
 */
export async function deleteMessage(id: number): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/message/delete',
      { method: 'POST', body: JSON.stringify({ id }) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/* ============================================================
   账号管理（多管理员，不含 RBAC）
   ------------------------------------------------------------
   安全：所有接口的响应**永不含密码哈希**；新建 / 重置返回的随机密码
   仅在「当次响应」中出现一次，页面必须即时展示并提示保存。
   ============================================================ */

/**
 * 账号列表（GET {P}/api/admin/list）
 * @param q 分页 + 账号名关键词
 * @returns 分页账号数据（每项含 is_self）
 */
export async function fetchAdminList(
  q?: Pick<ListQuery, 'page' | 'size' | 'keyword'>,
): Promise<AdminListData> {
  return guard(async () => {
    const params = new URLSearchParams();
    if (q?.page !== undefined) {
      params.set('page', String(q.page));
    }
    if (q?.size !== undefined) {
      params.set('size', String(q.size));
    }
    if (q?.keyword) {
      params.set('keyword', q.keyword);
    }
    const qs = params.toString();

    const res = await cmsRequest<AdminListData>(
      `/admin/list${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<AdminListData>(res);
  });
}

/**
 * 新建账号（POST {P}/api/admin/create）
 *
 * 密码由**服务端**随机生成，`must_change_password=1`（对方首次登录须改密）。
 * @param username 登录账号（字母开头，3~50 位字母/数字/下划线/短横线）
 * @returns 新账号信息 + 一次性随机密码
 */
export async function createAdmin(username: string): Promise<AdminCredentialResult> {
  return guard(async () => {
    const res = await cmsRequest<AdminCredentialResult>(
      '/admin/create',
      { method: 'POST', body: JSON.stringify({ username }) },
      getToken(),
    );
    return cmsUnwrap<AdminCredentialResult>(res);
  });
}

/**
 * 启用 / 停用账号（POST {P}/api/admin/toggle-status）
 *
 * 停用会**立即作废该账号全部会话**（在线端秒级掉线），且不可停用当前登录账号、
 * 不可使启用账号归零 —— 这些规则均由后端裁决。
 *
 * @param id 目标账号 ID
 * @param status 1=启用 0=停用
 */
export async function toggleAdminStatus(id: number, status: number): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/admin/toggle-status',
      { method: 'POST', body: JSON.stringify({ id, status }) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/**
 * 重置他人密码（POST {P}/api/admin/reset-password）
 *
 * 成功后：置 `must_change_password=1` 并**立即作废对方全部会话**。
 * 不可重置当前登录账号（本人改密请用「修改密码」页）。
 *
 * @param id 目标账号 ID
 * @returns 目标账号信息 + 一次性随机密码
 */
export async function resetAdminPassword(id: number): Promise<AdminCredentialResult> {
  return guard(async () => {
    const res = await cmsRequest<AdminCredentialResult>(
      '/admin/reset-password',
      { method: 'POST', body: JSON.stringify({ id }) },
      getToken(),
    );
    return cmsUnwrap<AdminCredentialResult>(res);
  });
}

/**
 * 删除账号（POST {P}/api/admin/delete，硬删除）
 *
 * `username` 为二次确认字段，须与目标账号名**完全一致**（大小写敏感），
 * 由后端 `hash_equals` 比对；不一致则拒绝，避免「凭 ID 误删」。
 *
 * @param id 目标账号 ID
 * @param username 目标账号名（二次确认）
 */
export async function deleteAdmin(id: number, username: string): Promise<void> {
  return guard(async () => {
    const res = await cmsRequest<null>(
      '/admin/delete',
      { method: 'POST', body: JSON.stringify({ id, username }) },
      getToken(),
    );
    cmsUnwrap<null>(res);
  });
}

/* ============================================================
   操作日志（只读审计流水，C-P1-3）
   ------------------------------------------------------------
   只读：后端**不提供**日志的修改 / 删除接口；本客户端仅查询。
   ============================================================ */

/**
 * 日志列表（GET {P}/api/oplog/list）
 *
 * 支持组合筛选（module / admin_name / result / keyword / start_date / end_date）。
 * `result` 需区分「未传」与「传 0」：仅在 `!== undefined` 时拼接。
 * 不传时间时后端**强制**套用默认最近 7 天窗（避免全表扫描）。
 *
 * @param q 查询参数（分页 + 6 项筛选）
 * @returns 分页日志数据
 */
export async function fetchOpLogList(q?: OpLogQuery): Promise<OpLogListData> {
  return guard(async () => {
    const params = new URLSearchParams();
    if (q?.page !== undefined) {
      params.set('page', String(q.page));
    }
    if (q?.size !== undefined) {
      params.set('size', String(q.size));
    }
    if (q?.module) {
      params.set('module', q.module);
    }
    if (q?.admin_name) {
      params.set('admin_name', q.admin_name);
    }
    if (q?.result !== undefined) {
      params.set('result', String(q.result));
    }
    if (q?.keyword) {
      params.set('keyword', q.keyword);
    }
    if (q?.start_date) {
      params.set('start_date', q.start_date);
    }
    if (q?.end_date) {
      params.set('end_date', q.end_date);
    }
    const qs = params.toString();

    const res = await cmsRequest<OpLogListData>(
      `/oplog/list${qs ? `?${qs}` : ''}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<OpLogListData>(res);
  });
}

/**
 * 日志详情（GET {P}/api/oplog/detail?id=）
 * @param id 日志 ID
 * @returns 单条日志（含 user_agent 与完整 detail）
 */
export async function fetchOpLogDetail(id: number): Promise<OpLogItem> {
  return guard(async () => {
    const res = await cmsRequest<OpLogItem>(
      `/oplog/detail?id=${encodeURIComponent(String(id))}`,
      { method: 'GET' },
      getToken(),
    );
    return cmsUnwrap<OpLogItem>(res);
  });
}

/* ============================================================
   图片上传
   ============================================================ */

/**
 * 上传图片（POST {P}/api/upload/image，multipart/form-data）
 *
 * 前端只负责挑选文件；**所有安全校验以后端为准**（真实 MIME + 扩展名白名单 +
 * ≤5MB）。返回的相对路径（如 `/uploads/product/xxxx.png`）可直接写入
 * `image` / `cover` / `logo` 字段。
 *
 * @param file 待上传文件
 * @param type 业务分组（product|news|case|common），决定落盘子目录
 * @returns 上传结果（url / path / size / mime / name）
 * @throws ApiError 业务失败（1001 校验不通过）或网络异常
 */
export async function uploadImage(
  file: File,
  type: UploadType = 'common',
): Promise<ImageUploadResult> {
  return guard(async () => {
    const form = new FormData();
    form.append('file', file);
    form.append('type', type);

    const res = await cmsUpload<ImageUploadResult>('/upload/image', form, getToken());
    return cmsUnwrap<ImageUploadResult>(res);
  });
}

export { ApiError };
