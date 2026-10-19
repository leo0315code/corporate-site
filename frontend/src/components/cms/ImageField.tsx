import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { UPLOAD } from '@/constants';
import { uploadImage } from '@/services/cms';
import type { UploadType } from '@/types';

export interface ImageFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前图片路径（如 /uploads/product/xxx.png 或 /product-crm.svg） */
  value: string;
  /** 上传成功 / 移除后的路径回调 */
  onChange: (path: string) => void;
  /** 上传业务分组（决定后端落盘子目录） */
  type: UploadType;
  /** 是否必填（仅展示星号） */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 是否禁用（保存中 / 编辑锁定） */
  disabled?: boolean;
  /** 图片描述（预览 alt，默认取 label） */
  alt?: string;
}

/** 取小写扩展名（含点）；无扩展名返回空串 */
function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i).toLowerCase();
}

/** 人类可读的大小 */
function humanSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * 图片上传字段（替代手写「图片路径 / 封面路径 / Logo 路径」输入框）
 *
 * 行为：
 * - **未选图**：显示上传按钮与格式/大小提示；
 * - **已选图**：显示缩略预览 + 当前路径 + 「更换 / 移除」；
 * - **上传中**：按钮禁用并显示「上传中…」，可取消（关闭抽屉由父级 loading 控制）。
 *
 * 校验分层：
 * - 前端**预检**（大小 + 扩展名）用于快速反馈，减少无效请求；
 * - 后端 `UploadService` 以 finfo 探测**真实 MIME** 并做「MIME ↔ 扩展名」交叉校验，
 *   为最终裁决；后端 message 会原样展示给用户。
 *
 * 注意：本组件使用 `<div>` 外壳（而非 FormFields 的 `<label>` 外壳），
 * 避免"按钮被 label 关联到隐藏 file input"导致的重复触发。
 */
export default function ImageField({
  label,
  value,
  onChange,
  type,
  required = false,
  error,
  disabled = false,
  alt,
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState('');
  /** 已上传文件的大小（仅本次会话展示用；刷新后无此信息） */
  const [sizeHint, setSizeHint] = useState('');

  const busy = disabled || uploading;
  const shownError = error || localError;

  /** 触发文件选择 */
  const pick = (): void => {
    if (!busy) {
      inputRef.current?.click();
    }
  };

  /** 选择文件 → 预检 → 上传 */
  const onFileChange = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = e.target;
    const file = input.files?.[0] ?? null;
    // 允许重复选择同一文件（否则第二次不触发 change）
    input.value = '';

    if (!file) {
      return;
    }

    setLocalError('');

    // —— 前端预检（快速反馈；最终以后端为准）——
    if (file.size > UPLOAD.MAX_SIZE) {
      setLocalError(`图片不得超过 5MB（当前 ${humanSize(file.size)}）`);
      return;
    }
    if (!(UPLOAD.ACCEPT_EXT as readonly string[]).includes(extOf(file.name))) {
      setLocalError(UPLOAD.HINT);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadImage(file, type);
      onChange(result.url);
      setSizeHint(humanSize(result.size));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '图片上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  /** 移除当前图片（仅清空字段，不删除服务器文件） */
  const remove = (): void => {
    if (busy) {
      return;
    }
    onChange('');
    setLocalError('');
    setSizeHint('');
  };

  return (
    <div className="block">
      <span className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-text">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </span>
      </span>

      <div
        className={`rounded-btn border bg-white p-3 ${
          shownError ? 'border-error' : 'border-border'
        }`}
      >
        <div className="flex items-start gap-3">
          {/* 预览（无图时展示占位） */}
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-btn border border-border bg-bg-soft">
            {value !== '' ? (
              <img
                src={value}
                alt={alt ?? label}
                className="h-full w-full object-contain"
                onError={(e) => {
                  // 预览失败不影响字段值，仅隐藏破图
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            ) : (
              <span className="px-1 text-center text-xs text-text-muted">暂无图片</span>
            )}
          </div>

          {/* 操作区 */}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={pick}
                className="rounded-btn bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? '上传中…' : value !== '' ? '更换图片' : '选择图片'}
              </button>
              {value !== '' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={remove}
                  className="rounded-btn border border-border px-3 py-1.5 text-xs text-text-secondary transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
                >
                  移除
                </button>
              )}
            </div>

            {/* 当前路径（只读展示，用户无需关心具体路径） */}
            {value !== '' && (
              <p className="truncate text-xs text-text-secondary" title={value}>
                已上传：{value}
                {sizeHint !== '' && `（${sizeHint}）`}
              </p>
            )}

            <p className="text-xs text-text-muted">{UPLOAD.HINT}</p>
          </div>
        </div>

        {/* 隐藏的原生文件选择器 */}
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD.ACCEPT_ATTR}
          className="hidden"
          disabled={busy}
          onChange={(e) => void onFileChange(e)}
        />
      </div>

      {shownError && <span className="mt-1 block text-xs text-error">{shownError}</span>}
    </div>
  );
}
