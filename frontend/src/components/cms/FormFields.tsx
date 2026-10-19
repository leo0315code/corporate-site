import type { ChangeEvent, ReactNode } from 'react';

/* ============================================================
   通用受控表单字段组件（后台复用）
   - 统一排版 / token 边框 / focus / 错误态
   - 全部受控：value + onChange
   ============================================================ */

/** 字段外壳：统一 label 排版 + 必填星号 + 错误提示 */
function FieldShell({
  label,
  required = false,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-medium text-text">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </span>
      </span>
      {children}
      {error && <span className="mt-1 block text-xs text-error">{error}</span>}
    </label>
  );
}

/** 输入框统一样式 */
const INPUT_CLASS =
  'w-full rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:bg-bg-soft';

/** 错误边框覆写 */
const INPUT_ERROR_CLASS = 'border-error focus:border-error';

/* ======================= TextField ======================= */

export interface TextFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 是否必填（仅展示星号，校验由业务负责） */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 占位符 */
  placeholder?: string;
  /** 最大长度（提供则显示字数计数） */
  maxLength?: number;
  /** 输入类型 */
  type?: 'text' | 'password' | 'number';
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 单行文本输入框（含可选字数计数）
 */
export function TextField({
  label,
  value,
  onChange,
  required = false,
  error,
  placeholder,
  maxLength,
  type = 'text',
  disabled = false,
}: TextFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <input
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      />
      {maxLength !== undefined && (
        <span className="mt-1 block text-right text-xs text-text-muted">
          {value.length}/{maxLength}
        </span>
      )}
    </FieldShell>
  );
}

/* ======================= TextAreaField ======================= */

export interface TextAreaFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 是否必填 */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 占位符 */
  placeholder?: string;
  /** 行数，默认 5 */
  rows?: number;
  /** 最大长度（提供则显示字数计数） */
  maxLength?: number;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 多行文本输入框（含可选字数计数）
 */
export function TextAreaField({
  label,
  value,
  onChange,
  required = false,
  error,
  placeholder,
  rows = 5,
  maxLength,
  disabled = false,
}: TextAreaFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <textarea
        value={value}
        rows={rows}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
        className={`${INPUT_CLASS} resize-y ${error ? INPUT_ERROR_CLASS : ''}`}
      />
      {maxLength !== undefined && (
        <span className="mt-1 block text-right text-xs text-text-muted">
          {value.length}/{maxLength}
        </span>
      )}
    </FieldShell>
  );
}

/* ======================= SelectField ======================= */

/** 下拉选项 */
export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前值 */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 选项列表 */
  options: SelectOption[];
  /** 是否必填 */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 占位（作为首个禁用项） */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 下拉选择框
 */
export function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  error,
  placeholder,
  disabled = false,
}: SelectFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <select
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value)}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      >
        {placeholder !== undefined && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

/* ======================= DateField ======================= */

export interface DateFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前值（YYYY-MM-DD） */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 是否必填 */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 日期选择框（type=date，值格式 YYYY-MM-DD）
 */
export function DateField({
  label,
  value,
  onChange,
  required = false,
  error,
  disabled = false,
}: DateFieldProps) {
  return (
    <FieldShell label={label} required={required} error={error}>
      <input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className={`${INPUT_CLASS} ${error ? INPUT_ERROR_CLASS : ''}`}
      />
    </FieldShell>
  );
}

/* ======================= TagListField ======================= */

export interface TagListFieldProps {
  /** 字段标签 */
  label: string;
  /** 当前字符串数组 */
  value: string[];
  /** 变化回调 */
  onChange: (value: string[]) => void;
  /** 是否必填 */
  required?: boolean;
  /** 错误文案 */
  error?: string;
  /** 单项占位符 */
  placeholder?: string;
  /** 单项最大长度 */
  itemMaxLength?: number;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 字符串数组字段（增 / 删 / 改），用于 `features`、`values` 等。
 */
export function TagListField({
  label,
  value,
  onChange,
  required = false,
  error,
  placeholder,
  itemMaxLength,
  disabled = false,
}: TagListFieldProps) {
  const updateAt = (index: number, text: string): void => {
    onChange(value.map((item, i) => (i === index ? text : item)));
  };

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addItem = (): void => {
    onChange([...value, '']);
  };

  return (
    <FieldShell label={label} required={required} error={error}>
      <div className="flex flex-col gap-2">
        {value.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="text"
              value={item}
              disabled={disabled}
              placeholder={placeholder}
              maxLength={itemMaxLength}
              onChange={(e) => updateAt(index, e.target.value)}
              className={INPUT_CLASS}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => removeAt(index)}
              className="shrink-0 rounded-btn border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="删除该项"
            >
              删除
            </button>
          </div>
        ))}
        <button
          type="button"
          disabled={disabled}
          onClick={addItem}
          className="self-start rounded-btn border border-dashed border-border px-3 py-2 text-sm text-primary transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          + 新增一项
        </button>
      </div>
    </FieldShell>
  );
}

/* ======================= ObjectListField ======================= */

/** 对象数组字段的列定义 */
export interface ObjectListFieldDef {
  /** 对象键名 */
  key: string;
  /** 列标签 */
  label: string;
  /** 控件类型 */
  type: 'text' | 'textarea';
  /** 占位符 */
  placeholder?: string;
  /** 是否必填（仅展示星号） */
  required?: boolean;
}

export interface ObjectListFieldProps<T extends Record<string, string>> {
  /** 字段标签 */
  label: string;
  /** 当前对象数组 */
  value: T[];
  /** 变化回调 */
  onChange: (value: T[]) => void;
  /** 列定义（参数化，决定每条对象的字段） */
  fields: ObjectListFieldDef[];
  /** 新增按钮文案，默认「+ 新增一项」 */
  addText?: string;
  /** 空态文案 */
  emptyText?: string;
  /** 是否禁用 */
  disabled?: boolean;
}

/**
 * 对象数组字段（增 / 删 / 改任一字段）。
 *
 * 用于 `timeline`（`{year,title,desc}`）与 `abilities`（`{title,desc}`）等结构化列表；
 * 列由 `fields` 参数化配置。
 */
export function ObjectListField<T extends Record<string, string>>({
  label,
  value,
  onChange,
  fields,
  addText = '+ 新增一项',
  emptyText = '暂无条目',
  disabled = false,
}: ObjectListFieldProps<T>) {
  const updateField = (index: number, key: string, text: string): void => {
    onChange(value.map((item, i) => (i === index ? ({ ...item, [key]: text } as T) : item)));
  };

  const removeAt = (index: number): void => {
    onChange(value.filter((_, i) => i !== index));
  };

  const addItem = (): void => {
    const empty = fields.reduce<Record<string, string>>((acc, f) => {
      acc[f.key] = '';
      return acc;
    }, {});
    onChange([...value, empty as T]);
  };

  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium text-text">{label}</span>

      <div className="flex flex-col gap-3">
        {value.length === 0 && (
          <p className="rounded-btn border border-dashed border-border px-3 py-4 text-center text-sm text-text-muted">
            {emptyText}
          </p>
        )}

        {value.map((item, index) => (
          <div key={index} className="rounded-md border border-border bg-bg-soft p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-text-secondary">第 {index + 1} 项</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => removeAt(index)}
                className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
              >
                删除
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {fields.map((f) => (
                <div
                  key={f.key}
                  className={f.type === 'textarea' ? 'md:col-span-2' : undefined}
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-text">
                      {f.label}
                      {f.required && <span className="ml-0.5 text-error">*</span>}
                    </span>
                    {f.type === 'textarea' ? (
                      <textarea
                        rows={3}
                        value={item[f.key] ?? ''}
                        disabled={disabled}
                        placeholder={f.placeholder}
                        onChange={(e) => updateField(index, f.key, e.target.value)}
                        className={`${INPUT_CLASS} resize-y`}
                      />
                    ) : (
                      <input
                        type="text"
                        value={item[f.key] ?? ''}
                        disabled={disabled}
                        placeholder={f.placeholder}
                        onChange={(e) => updateField(index, f.key, e.target.value)}
                        className={INPUT_CLASS}
                      />
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>
        ))}

        <button
          type="button"
          disabled={disabled}
          onClick={addItem}
          className="self-start rounded-btn border border-dashed border-border px-3 py-2 text-sm text-primary transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {addText}
        </button>
      </div>
    </div>
  );
}
