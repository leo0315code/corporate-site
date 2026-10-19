import { useEffect } from 'react';

export interface ToastProps {
  /** 是否显示 */
  open: boolean;
  /** 提示文案 */
  message: string;
  /** 类型：成功 / 失败 */
  type?: 'success' | 'error';
  /** 自动关闭时间（毫秒），默认 3000 */
  duration?: number;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 轻量提示组件：右上角浮层，自动消失。
 * 通过 open 控制显隐，父组件负责状态管理。
 */
export default function Toast({
  open,
  message,
  type = 'success',
  duration = 3000,
  onClose,
}: ToastProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      onClose();
    }, duration);
    return () => window.clearTimeout(timer);
  }, [open, duration, onClose]);

  if (!open) {
    return null;
  }

  const isSuccess = type === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 top-20 z-[60] animate-fade-in-up md:right-8"
    >
      <div
        className={`flex items-center gap-3 rounded-md border bg-white px-5 py-4 shadow-md ${
          isSuccess ? 'border-success/30' : 'border-error/30'
        }`}
      >
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white ${
            isSuccess ? 'bg-success' : 'bg-error'
          }`}
          aria-hidden="true"
        >
          {isSuccess ? (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M4 10.5l4 4 8-9"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M10 6v5M10 14h.01"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          )}
        </span>
        <span className="text-sm text-text">{message}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭提示"
          className="ml-2 text-text-muted transition-colors hover:text-text"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
            <path
              d="M5 5l10 10M15 5L5 15"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
