import { useEffect } from 'react';
import type { ReactNode } from 'react';

export interface FormDrawerProps {
  /** 是否显示 */
  open: boolean;
  /** 标题（如「新增产品」/「编辑新闻」） */
  title: string;
  /** 表单内容 */
  children: ReactNode;
  /** 关闭回调（点击遮罩 / 关闭按钮 / Esc） */
  onClose: () => void;
  /** 是否提交中（提交中禁止关闭，避免丢数据） */
  loading?: boolean;
}

/**
 * 表单抽屉：右侧滑出面板 + 半透明遮罩，用于承载内容新增 / 编辑表单。
 *
 * - 打开时锁定 body 滚动；Esc 关闭（提交中不响应）；
 * - 遮罩点击关闭（提交中不响应）；
 * - 窄屏面板占满高度、宽度自适应（`w-full max-w-xl`），不产生横向溢出。
 */
export default function FormDrawer({
  open,
  title,
  children,
  onClose,
  loading = false,
}: FormDrawerProps) {
  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !loading) {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, loading, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* 遮罩 */}
      <button
        type="button"
        aria-label="关闭"
        className="absolute inset-0 bg-secondary/40"
        onClick={() => {
          if (!loading) {
            onClose();
          }
        }}
      />

      {/* 抽屉面板 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-border bg-white shadow-lg"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <button
            type="button"
            aria-label="关闭"
            disabled={loading}
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-btn text-text-secondary transition-colors hover:bg-bg-soft hover:text-text disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
              <path
                d="M5 5l10 10M15 5L5 15"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
