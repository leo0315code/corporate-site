import { useState } from 'react';
import type { ChangeEvent } from 'react';

export interface IdFieldProps {
  /** 字段标签（默认「唯一标识 id」） */
  label?: string;
  /** 当前 id */
  value: string;
  /** id 变化回调 */
  onChange: (value: string) => void;
  /**
   * 是否为编辑态。
   * **编辑态一律只读**：id 构成前台详情页 URL（`/products/:id`），
   * 变更会导致既有分享链接失效，故不提供任何修改入口。
   */
  editing: boolean;
  /** 自动生成器（「换一个」按钮点击时调用） */
  generator: () => string;
  /** 是否必填（仅展示星号） */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 手动模式下的占位符 */
  placeholder?: string;
  /** 最大长度（与后端校验对齐） */
  maxLength?: number;
  /** 是否禁用（保存中等） */
  disabled?: boolean;
}

/**
 * 唯一标识 id 字段
 *
 * 设计（对齐"不可能让用户手写主键"的诉求）：
 * - **新增 · 默认自动生成**：只读展示系统生成的 id，并提供「换一个」重新生成；
 *   若确需自定义，点击「手动指定」切换为输入框；
 * - **新增 · 手动指定**：可自由输入，并提供「改回自动」返回自动模式；
 * - **编辑**：恒为只读 + 灰色说明，杜绝误改导致 URL 失效。
 *
 * 该组件的 `manual` 状态依赖抽屉关闭时**卸载**来复位（FormDrawer 关闭时返回 null），
 * 因此每次打开新增抽屉都回到「自动生成」的默认态。
 */
export default function IdField({
  label = '唯一标识 id',
  value,
  onChange,
  editing,
  generator,
  required = false,
  error,
  placeholder = '如 product-cloud（字母/数字/连字符）',
  maxLength,
  disabled = false,
}: IdFieldProps) {
  const [manual, setManual] = useState(false);

  /** 自动模式：新增且未切换手动 → 值为系统生成，输入框只读 */
  const autoMode = !editing && !manual;
  /** 只读态：编辑中（永久锁定），或自动模式（不允许直接编辑） */
  const readOnly = editing || autoMode;

  return (
    <div className="block">
      <span className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-text">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </span>

        {/* 仅新增态提供模式切换 */}
        {!editing && !disabled && (
          <button
            type="button"
            onClick={() => {
              const next = !manual;
              setManual(next);
              // 改回自动生成时，若当前为空（或用户已清空）则补一个，
              // 避免出现「看起来是自动模式但值为空」的状态
              if (!next && value.trim() === '') {
                onChange(generator());
              }
            }}
            className="text-xs text-primary transition-colors hover:text-primary-dark"
          >
            {manual ? '改回自动生成' : '手动指定'}
          </button>
        )}
      </span>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={value}
          readOnly={readOnly}
          maxLength={maxLength}
          placeholder={readOnly ? '' : placeholder}
          onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full rounded-btn border px-3 py-2 text-sm transition-colors focus:outline-none disabled:cursor-not-allowed disabled:bg-bg-soft ${
            readOnly
              ? 'cursor-default border-border bg-bg-soft text-text-secondary focus:border-border'
              : 'border-border bg-white text-text placeholder:text-text-muted focus:border-primary'
          } ${error ? 'border-error focus:border-error' : ''}`}
        />

        {/* 自动模式下的「换一个」（避免极小概率的 id 冲突） */}
        {autoMode && !disabled && (
          <button
            type="button"
            onClick={() => onChange(generator())}
            className="shrink-0 rounded-btn border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
            title="重新生成一个 id"
          >
            换一个
          </button>
        )}
      </div>

      {/* 说明文案 */}
      <span className="mt-1 block text-xs text-text-muted">
        {editing
          ? '主键已固定，创建后不可修改（修改会导致前台详情页链接失效）'
          : manual
            ? '手动指定后请确保唯一；保存时若与已有 id 重复会提示更换'
            : '系统自动生成，通常无需关心；如需自定义可点击「手动指定」'}
      </span>

      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </div>
  );
}
