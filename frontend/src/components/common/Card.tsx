import type { ReactNode } from 'react';

export interface CardProps {
  /** 子内容 */
  children: ReactNode;
  /** 是否可交互（hover 时阴影加深并上浮） */
  hoverable?: boolean;
  /** 是否去除内边距（用于图片铺满场景） */
  noPadding?: boolean;
  className?: string;
  /** 点击回调（可选） */
  onClick?: () => void;
}

/**
 * 通用卡片：白底 + 1px 边框 + 圆角 12px，
 * hoverable 时阴影加深并轻微上浮。
 */
export default function Card({
  children,
  hoverable = false,
  noPadding = false,
  className = '',
  onClick,
}: CardProps) {
  const base =
    'rounded-md border border-border bg-white shadow-sm transition-all duration-300';
  const hover = hoverable
    ? 'hover:-translate-y-1 hover:shadow-md hover:border-primary/30'
    : '';
  const padding = noPadding ? '' : 'p-6 md:p-8';
  const clickable = onClick ? 'cursor-pointer' : '';

  return (
    <div
      className={`${base} ${hover} ${padding} ${clickable} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
