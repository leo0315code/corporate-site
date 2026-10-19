import { CMS_MESSAGES, ERROR_CODES, MESSAGES } from '@/constants';
import { ApiError } from '@/services/api';

/* ============================================================
   后台认证表单共享逻辑（登录 / 强制改密 / 常规改密复用）
   - 密码强度规则与后端 AuthService::checkStrength 保持一致
   - 统一「后端 message 优先，其次错误码兜底」的展示策略
   ============================================================ */

/** 新密码最小长度（与后端 AuthValidate length:8,72 一致） */
export const PASSWORD_MIN_LENGTH = 8;

/** 新密码最大长度（与后端 AuthValidate length:8,72 一致） */
export const PASSWORD_MAX_LENGTH = 72;

/** 新密码强度统一提示文案 */
export const PASSWORD_REQUIREMENT = '密码至少 8 位，且需同时包含字母和数字';

/** Toast 展示状态 */
export interface ToastState {
  open: boolean;
  message: string;
  type: 'success' | 'error';
}

/** 构造初始关闭态 Toast */
export function closedToast(): ToastState {
  return { open: false, message: '', type: 'error' };
}

/**
 * 解析认证类异常为「错误码 + 可展示文案」。
 *
 * 策略：优先使用后端返回的 message（如 1005 含剩余分钟、1004 防枚举文案），
 * 其次用 CMS_MESSAGES 按码兜底，最后用调用方给定的 fallback。
 * 非 ApiError（网络异常 / 超时）统一归一化为网络错误文案。
 *
 * @param err 捕获到的异常
 * @param fallback 最终兜底文案
 * @returns 错误码与展示文案
 */
export function resolveAuthError(err: unknown, fallback: string): { code: number; message: string } {
  if (err instanceof ApiError) {
    const mapped = CMS_MESSAGES[err.code as keyof typeof CMS_MESSAGES];
    return { code: err.code, message: err.message || mapped || fallback };
  }
  return { code: ERROR_CODES.SERVER_ERROR, message: MESSAGES.NETWORK_ERROR };
}

/**
 * 校验新密码强度（与后端规则一致，仅做前端即时提示；最终以后端裁决为准）。
 *
 * 规则：长度 8~72；同时包含字母与数字；不得与账号名相同（忽略大小写）。
 *
 * @param password 新密码
 * @param username 当前账号名（用于「不得与账号名相同」判定，缺省跳过该校验）
 * @returns 符合返回空串；不符合返回可直接展示的中文提示
 */
export function evaluateNewPassword(password: string, username = ''): string {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `新密码长度不得少于 ${PASSWORD_MIN_LENGTH} 位`;
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `新密码长度不得大于 ${PASSWORD_MAX_LENGTH} 位`;
  }

  const hasLetter = /[A-Za-z]/.test(password);
  const hasDigit = /\d/.test(password);
  if (!hasLetter || !hasDigit) {
    return '新密码需同时包含字母和数字';
  }

  if (username !== '' && password.toLowerCase() === username.toLowerCase()) {
    return '新密码不得与账号名相同';
  }

  return '';
}
