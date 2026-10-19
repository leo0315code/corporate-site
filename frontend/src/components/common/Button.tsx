import { Link } from 'react-router-dom';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps {
  /** 子内容 */
  children: ReactNode;
  /** 外观变体 */
  variant?: 'primary' | 'outline' | 'text';
  /** 尺寸 */
  size?: 'md' | 'lg';
  /** 内部跳转路径；传入则渲染为 <Link> */
  to?: string;
  /** 外部链接；传入则渲染为 <a> */
  href?: string;
  /** 原生按钮属性（onClick / type / disabled 等） */
  buttonProps?: ButtonHTMLAttributes<HTMLButtonElement>;
  /** 是否禁用 */
  disabled?: boolean;
  className?: string;
}

/**
 * 通用按钮：
 * - variant: primary（实心主色）/ outline（描边）/ text（文字）
 * - size: md / lg
 * - 传入 to → <Link>；传入 href → <a>；否则 → <button>
 * 统一 hover 加深 + 轻微上浮，圆角 8px。
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  to,
  href,
  buttonProps,
  disabled = false,
  className = '',
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-btn font-medium transition-all duration-200 select-none whitespace-nowrap';

  const sizes: Record<'md' | 'lg', string> = {
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  const variants: Record<'primary' | 'outline' | 'text', string> = {
    primary:
      'bg-primary text-white shadow-sm hover:bg-primary-dark hover:-translate-y-0.5 hover:shadow-md active:translate-y-0',
    outline:
      'border border-primary text-primary bg-white hover:bg-primary-light hover:-translate-y-0.5',
    text: 'text-primary px-2 py-1 hover:text-primary-dark hover:underline underline-offset-4',
  };

  const disabledClass = disabled
    ? 'cursor-not-allowed opacity-60 pointer-events-none'
    : '';

  const classes = `${base} ${sizes[size]} ${variants[variant]} ${disabledClass} ${className}`;

  if (to && !disabled) {
    return (
      <Link to={to} className={classes}>
        {children}
      </Link>
    );
  }

  if (href && !disabled) {
    return (
      <a href={href} className={classes} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  return (
    <button type="button" className={classes} {...buttonProps} disabled={disabled}>
      {children}
    </button>
  );
}
