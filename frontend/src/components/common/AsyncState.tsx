/* ============================================================
   前台异步内容通用状态组件（骨架 / 错误重试 / 空态）
   ------------------------------------------------------------
   首页各区块与列表页统一复用，保证「加载 / 失败 / 空」三态视觉一致。
   仅消费设计 token（bg-border / text-text-secondary / primary 等），无裸色值。
   ============================================================ */

/** 文字色板（深色区块需切换为浅色） */
export type AsyncTone = 'default' | 'light';

/** 骨架占位块：若干行灰条，最后一行半宽 */
export interface SkeletonBlockProps {
  /** 占位行数，默认 3 */
  lines?: number;
  /** 额外类名（控制宽度 / 间距） */
  className?: string;
}

/**
 * 骨架占位块。
 * @param props 行数与类名
 */
export function SkeletonBlock({ lines = 3, className = '' }: SkeletonBlockProps) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`h-4 rounded bg-border ${index === lines - 1 ? 'w-2/3' : 'w-full'}`}
        />
      ))}
    </div>
  );
}

/** 骨架卡片：图标占位 + 文本占位 */
export interface SkeletonCardProps {
  /** 额外类名 */
  className?: string;
}

/**
 * 骨架卡片（用于卡片网格的加载态）。
 * @param props 类名
 */
export function SkeletonCard({ className = '' }: SkeletonCardProps) {
  return (
    <div className={`rounded-md border border-border bg-white p-6 md:p-8 ${className}`}>
      <div className="mb-5 h-12 w-12 animate-pulse rounded-md bg-border" />
      <SkeletonBlock lines={3} />
    </div>
  );
}

/** 错误 + 重试 */
export interface SectionErrorProps {
  /** 提示文案 */
  message?: string;
  /** 重试回调 */
  onRetry?: () => void;
  /** 色板（默认 / 深色背景） */
  tone?: AsyncTone;
  /** 额外类名 */
  className?: string;
}

/**
 * 错误态：提示 + 重新加载按钮。
 * @param props 文案 / 重试 / 色板
 */
export function SectionError({
  message = '内容加载失败，请稍后重试',
  onRetry,
  tone = 'default',
  className = '',
}: SectionErrorProps) {
  const isLight = tone === 'light';
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 py-12 text-center ${className}`}
    >
      <p className={`text-sm ${isLight ? 'text-white/70' : 'text-text-secondary'}`}>
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className={
          isLight
            ? 'inline-flex items-center justify-center rounded-btn border border-white/40 px-6 py-2.5 text-sm font-medium text-white transition-colors duration-200 hover:bg-white/10'
            : 'inline-flex items-center justify-center rounded-btn border border-primary bg-white px-6 py-2.5 text-sm font-medium text-primary transition-colors duration-200 hover:bg-primary-light'
        }
      >
        重新加载
      </button>
    </div>
  );
}

/** 空态 */
export interface SectionEmptyProps {
  /** 提示文案 */
  text?: string;
  /** 色板（默认 / 深色背景） */
  tone?: AsyncTone;
  /** 额外类名 */
  className?: string;
}

/**
 * 空态：数据存在但为空集合时展示。
 * @param props 文案 / 色板
 */
export function SectionEmpty({ text = '暂无数据', tone = 'default', className = '' }: SectionEmptyProps) {
  const isLight = tone === 'light';
  return (
    <div className={`py-12 text-center text-sm ${isLight ? 'text-white/60' : 'text-text-secondary'} ${className}`}>
      {text}
    </div>
  );
}

/** 降级提示（接口失败、正展示本地兜底内容时的轻提示） */
export interface DegradedNoticeProps {
  /** 提示文案 */
  text?: string;
  /** 重试回调（提供则展示「重试」按钮） */
  onRetry?: () => void;
  /** 额外类名 */
  className?: string;
}

/**
 * 降级提示条：接口失败但已渲染 `src/data/*.ts` 兜底内容时，顶部展示的轻提示。
 *
 * 对应架构文档 5.3「渲染兜底内容 + 顶部轻提示」：不覆盖布局、不打断阅读，
 * 仅告知访客当前为缓存内容，并提供「重试」以回到线上数据。
 *
 * @param props 文案 / 重试 / 类名
 */
export function DegradedNotice({
  text = '内容加载失败，当前展示的是本地缓存内容',
  onRetry,
  className = '',
}: DegradedNoticeProps) {
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-bg-soft px-4 py-2.5 text-sm text-text-secondary ${className}`}
    >
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-error" aria-hidden="true" />
        {text}
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-medium text-primary transition-colors duration-200 hover:text-primary-dark"
        >
          重试
        </button>
      ) : null}
    </div>
  );
}
