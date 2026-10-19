import { CMS, CMS_ROUTES, ERROR_CODES } from '@/constants';
import { ApiError } from '@/services/api';

/**
 * 会话 Token 管理（localStorage）。
 *
 * 安全约定：
 * - Token 仅存于 localStorage，**不得**拼入 URL、不得写入 console/日志；
 * - 所有读写均做空值兜底，避免 SSR / 隐私模式下的异常。
 */

/**
 * 读取当前会话 Token
 * @returns Token 字符串；不存在返回 null
 */
export function getToken(): string | null {
  try {
    return window.localStorage.getItem(CMS.TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * 写入会话 Token
 * @param token 64 位十六进制 Token
 */
export function setToken(token: string): void {
  try {
    window.localStorage.setItem(CMS.TOKEN_KEY, token);
  } catch {
    // 隐私模式 / 配额异常：静默失败，调用方仍可继续（下次请求会 1003 提示登录）
  }
}

/** 清除会话 Token */
export function clearToken(): void {
  try {
    window.localStorage.removeItem(CMS.TOKEN_KEY);
  } catch {
    // 忽略
  }
}

/**
 * 认证错误分流处理
 *
 * - `1003`（未登录/过期）→ 清除 Token 并跳转登录页；
 * - `1006`（需先改初始密码）→ 跳转强制改密页；
 * - 其它错误 → 不处理。
 *
 * 使用 `window.location.href` 跳转，避免依赖 React Router 的 hook（可在任意层调用）。
 *
 * @param err 捕获到的异常
 * @returns 是否已处理（true=已跳转，调用方通常无需再展示 message）
 */
export function handleAuthError(err: unknown): boolean {
  if (!(err instanceof ApiError)) {
    return false;
  }

  if (err.code === ERROR_CODES.UNAUTHORIZED) {
    clearToken();
    window.location.href = CMS_ROUTES.LOGIN;
    return true;
  }

  if (err.code === ERROR_CODES.NEED_RESET_PWD) {
    window.location.href = CMS_ROUTES.RESET_PASSWORD;
    return true;
  }

  return false;
}
