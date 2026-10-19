/* ============================================================
   全站类型定义（与 docs/class-diagram.mermaid 完全一致）
   ============================================================ */

/** 统一响应格式：code=0 表示成功 */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
}

/* ---------- 站点配置（site.config.ts） ---------- */

export interface NavItem {
  label: string;
  path: string;
}

export interface QuickLink {
  label: string;
  path: string;
}

export interface SocialLink {
  label: string;
  url: string;
  icon: string;
}

export interface ContactInfo {
  phone: string;
  email: string;
  address: string;
  workTime: string;
  /** 静态地图占位图路径 */
  mapImage: string;
}

export interface FooterConfig {
  copyright: string;
  /** 备案号 */
  icp: string;
  quickLinks: QuickLink[];
  socials: SocialLink[];
}

export interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
}

export interface SeoConfig {
  title: string;
  description: string;
  keywords: string;
}

export interface SiteConfig {
  companyName: string;
  logo: string;
  slogan: string;
  description: string;
  nav: NavItem[];
  contact: ContactInfo;
  footer: FooterConfig;
  theme: ThemeConfig;
  seo: SeoConfig;
}

/** 页脚中**可后台配置**的部分（快速链接始终来自静态配置，故不在此列） */
export interface SiteConfigFooterData {
  copyright: string;
  icp: string;
  socials: SocialLink[];
}

/**
 * 站点配置中**由后端提供**的业务子集（GET /api/site/config 的 data 结构）。
 *
 * 说明：`nav` / `theme` / `footer.quickLinks` **不在契约内**——
 * 导航菜单配错路径会导致前台 404，主题色受构建期 Tailwind 编译约束，
 * 二者与快速链接同源，均保持前端静态配置。前端 Provider 会用静态配置补齐这几项。
 */
export interface SiteConfigData {
  companyName: string;
  logo: string;
  slogan: string;
  description: string;
  contact: ContactInfo;
  footer: SiteConfigFooterData;
  seo: SeoConfig;
}

/* ---------- 业务数据 ---------- */

export interface Product {
  id: string;
  category: string;
  name: string;
  summary: string;
  description: string;
  features: string[];
  image: string;
  icon: string;
}

export interface NewsItem {
  id: string;
  title: string;
  /** ISO 8601（YYYY-MM-DD） */
  date: string;
  category: string;
  cover: string;
  summary: string;
  content: string;
}

export interface TimelineItem {
  year: string;
  title: string;
  desc: string;
}

export interface Ability {
  title: string;
  desc: string;
}

export interface AboutData {
  intro: string;
  vision: string;
  mission: string;
  values: string[];
  timeline: TimelineItem[];
  abilities: Ability[];
}

export interface Advantage {
  value: string;
  label: string;
  desc: string;
}

export interface CaseItem {
  id: string;
  name: string;
  logo: string;
  desc: string;
}

/* ---------- 留言 ---------- */

export interface MessagePayload {
  name: string;
  /** 公司名称（选填，长度 ≤50） */
  company?: string;
  /** 与 email 至少填一项 */
  phone: string;
  email: string;
  content: string;
}

/* ---------- 留言列表（P2：GET /api/message/list） ---------- */

export interface MessageRecord {
  id: number;
  name: string;
  company: string | null;
  phone: string;
  email: string;
  content: string;
  ip: string;
  created_at: string;
}

export interface MessageListData {
  total: number;
  page: number;
  size: number;
  items: MessageRecord[];
}

/* ============================================================
   CMS 后台增量类型（与 docs/ARCHITECTURE-CMS.md 第四/五节一致）
   说明：仅**追加**，不改动上述既有定义。
   ============================================================ */

/** 通用分页结构 */
export interface PagedData<T> {
  total: number;
  page: number;
  size: number;
  items: T[];
}

/** 优势项（后台需 id 作操作标识；前台渲染忽略 id） */
export interface AdvantageItem extends Advantage {
  id: number;
}

/** 内容列表查询参数 */
export interface ListQuery {
  page?: number;
  size?: number;
  keyword?: string;
  category?: string;
}

/* ---------- 后台认证 ---------- */

/** 当前管理员资料（后端 toProfile() 返回，password 永不返回） */
export interface AdminProfile {
  id: number;
  username: string;
  must_change_password: boolean;
  status: number;
  last_login_at: string | null;
  last_login_ip: string;
}

/** 登录请求载荷 */
export interface LoginPayload {
  username: string;
  password: string;
}

/** 登录结果 */
export interface LoginResult {
  token: string;
  expires_at: string;
  expires_in: number;
  must_change_password: boolean;
  profile: AdminProfile;
}

/** 常规改密载荷 */
export interface ChangePasswordPayload {
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/** 首次强制改密载荷 */
export interface ResetPasswordPayload {
  newPassword: string;
  confirmPassword: string;
}

/* ---------- 账号管理（多管理员，不含 RBAC） ---------- */

/**
 * 账号列表项（后端 `AdminUser::toAdminItem()` 返回，**永不含密码哈希**）。
 *
 * 与 `AdminProfile` 的差异：
 * - 无 `is_self` 以外的差异字段，但 `must_change_password` 在此为 **number**（0/1），
 *   便于列表直接渲染「需改密 / 正常」标签；`AdminProfile` 则用 boolean 表达自身状态。
 */
export interface AdminListItem {
  id: number;
  username: string;
  /** 1=启用 0=停用 */
  status: number;
  /** 1=需强制改密（新建 / 重置后） */
  must_change_password: number;
  /**
   * 1=主账号（`cms:init` 创建的初始管理员）。
   *
   * 语义：主账号**不可被停用 / 删除**（后端强制），但它**不带来额外权限**——
   * 管理员之间权限完全等同（RBAC 属 P2-2）。前端据此渲染「主账号」标记并禁用按钮。
   */
  is_primary: number;
  last_login_at: string | null;
  last_login_ip: string;
  created_at: string;
  /** 是否为当前登录账号（后端注入）——前端据此禁用危险操作 */
  is_self: boolean;
}

export type AdminListData = PagedData<AdminListItem>;

/**
 * 新建账号 / 重置密码的结果。
 *
 * 安全约定：`password` 为**服务端生成的随机强密码，仅本次响应返回一次**，
 * 之后无法再次获取；前端必须即时展示并提示用户立即保存（该账号首次登录会被强制改密）。
 */
export interface AdminCredentialResult {
  id: number;
  username: string;
  password: string;
}

/* ---------- 内容保存载荷（带编辑标记） ---------- */

export type ProductSavePayload = Product & { _editing?: boolean };
export type NewsSavePayload = NewsItem & { _editing?: boolean };
export type CaseSavePayload = CaseItem & { _editing?: boolean };
/** 优势：带 id=编辑，无 id=新增 */
export interface AdvantageSavePayload {
  id?: number;
  value: string;
  label: string;
  desc: string;
}

/* ---------- 新闻详情（含上下篇导航） ---------- */

/** 新闻导航项（上一篇 / 下一篇） */
export interface NewsNav {
  id: string;
  title: string;
}

export interface NewsDetailData {
  item: NewsItem;
  prev: NewsNav | null;
  next: NewsNav | null;
}

/* ---------- 首页聚合 ---------- */

export interface HomeSummary {
  products: Product[];
  advantages: AdvantageItem[];
  cases: CaseItem[];
  news: NewsItem[];
}

/* ---------- 留言管理（后台含处理状态） ---------- */

export interface MessageRecordAdmin extends MessageRecord {
  /** 处理状态：0=待处理 1=已处理 */
  status: number;
  /** 处理时间（已处理时非空） */
  handled_at: string | null;
}

export type MessageListAdminData = PagedData<MessageRecordAdmin>;

/* ---------- 图片上传 ---------- */

/** 上传业务分组（决定落盘子目录） */
export type UploadType = 'product' | 'news' | 'case' | 'common';

/** 图片上传结果（后端 UploadService 返回） */
export interface ImageUploadResult {
  /** 可直接使用的相对路径（如 /uploads/product/xxxx.png） */
  url: string;
  /** 同 url（语义别名） */
  path: string;
  /** 文件字节数 */
  size: number;
  /** 服务端探测的真实 MIME */
  mime: string;
  /** 落盘文件名（随机名） */
  name: string;
}

/* ---------- 操作日志（只读审计流水，C-P1-3） ---------- */

/**
 * 操作日志项（后端 `OpLog::toLogItem()` 返回，字段名一一对应）。
 *
 * 说明：日志为**只增不改**的审计流水，无更新/删除接口；本类型仅用于只读展示。
 */
export interface OpLogItem {
  id: number;
  /** 操作人 ID；0=未识别（如登录失败账号不存在） */
  admin_id: number;
  /** 操作人账号名快照（账号被删后仍可读） */
  admin_name: string;
  /** 操作时间（服务端时间，YYYY-MM-DD HH:mm:ss） */
  created_at: string;
  /** 业务模块枚举（见 OPLOG_MODULES） */
  module: string;
  /** 动作枚举（见 OPLOG_ACTIONS） */
  action: string;
  /** 目标对象可读标识（内容=slug、账号=账号名、单例=常量） */
  target: string;
  /** 目标对象人类可读名（删除后仍保留当时名称） */
  target_name: string;
  /** 来源 IP（兼容 IPv6） */
  ip: string;
  /** 请求 UA（截断 255） */
  user_agent: string;
  /** 1=成功 0=失败 */
  result: number;
  /** 变化摘要 / 失败原因（≤500，超长截断加 …） */
  detail: string;
}

export type OpLogListData = PagedData<OpLogItem>;

/**
 * 日志查询参数（全部可选；`result` 区分「未传」与「传 0」）。
 *
 * 日期格式均为 `YYYY-MM-DD`；不传时间时后端**强制**套用默认最近 7 天窗。
 */
export interface OpLogQuery {
  page?: number;
  size?: number;
  module?: string;
  admin_name?: string;
  result?: number;
  keyword?: string;
  /** 开始日期（YYYY-MM-DD） */
  start_date?: string;
  /** 结束日期（YYYY-MM-DD） */
  end_date?: string;
}
