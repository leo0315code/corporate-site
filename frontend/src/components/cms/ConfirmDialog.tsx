import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface ConfirmDialogProps {
  /** 是否显示 */
  open: boolean;
  /** 标题 */
  title: string;
  /** 内容（文案或节点） */
  content: ReactNode;
  /** 确认按钮文案，默认「确定」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** 危险操作：确认按钮使用 error 色 */
  danger?: boolean;
  /** 确认中（按钮置灰，防重复点击） */
  loading?: boolean;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消 / 关闭回调 */
  onCancel: () => void;
}

/**
 * 通用确认对话框：遮罩 + 居中卡片。
 *
 * - 支持 Esc 关闭；
 * - 打开时锁定 body 滚动；
 * - `loading` 时确认按钮置灰，避免重复提交。
 */
export default function ConfirmDialog({
  open,
  title,
  content,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Esc 关闭 + 锁定滚动
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) {
        onCancel();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, loading, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭对话框"
        className="absolute inset-0 bg-secondary/40"
        onClick={() => {
          if (!loading) {
            onCancel();
          }
        }}
      />

      {/* 卡片 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-md border border-border bg-white p-6 shadow-lg"
      >
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <div className="mt-3 text-sm text-text-secondary">{content}</div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-btn px-4 py-2 text-sm font-medium text-white transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              danger ? 'bg-error hover:bg-error/90' : 'bg-primary hover:bg-primary-dark'
            }`}
          >
            {loading ? '处理中…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
