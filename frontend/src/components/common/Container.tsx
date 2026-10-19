import type { ReactNode } from 'react';

export interface ContainerProps {
  /** 子内容 */
  children: ReactNode;
  /** 额外的类名，用于局部覆盖（如调整留白） */
  className?: string;
  /** 语义化标签，默认 div */
  as?: 'div' | 'section' | 'header' | 'footer' | 'nav' | 'main';
}

/**
 * 内容容器：最大宽度 1200px 居中 + 左右 24px 留白。
 * 全站页面区块统一包裹此组件，保证对齐一致。
 */
export default function Container({
  children,
  className = '',
  as: Tag = 'div',
}: ContainerProps) {
  return (
    <Tag className={`mx-auto w-full max-w-container px-6 ${className}`}>
      {children}
    </Tag>
  );
}
