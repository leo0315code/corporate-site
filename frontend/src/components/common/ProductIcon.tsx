export interface ProductIconProps {
  /** 图标标识（来自 products 数据的 icon 字段） */
  name: string;
  className?: string;
}

/**
 * 产品图标组件：根据 icon 标识渲染对应线性图标。
 * 统一 24×24 viewBox，使用 currentColor 继承父级颜色。
 * 未匹配的标识回退为通用「方块」图标，保证永不空白。
 */
export default function ProductIcon({ name, className = 'h-6 w-6' }: ProductIconProps) {
  const common = {
    viewBox: '0 0 24 24',
    fill: 'none',
    className,
    'aria-hidden': true,
  } as const;

  switch (name) {
    case 'cloud':
      return (
        <svg {...common}>
          <path
            d="M7 18a4 4 0 010-8 5 5 0 019.6-1.5A3.5 3.5 0 0117 18H7z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'chart':
      return (
        <svg {...common}>
          <path
            d="M4 20h16M7 20v-6M12 20V8M17 20v-9"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'ai':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3v3M12 18v3M3 12h3M18 12h3M9.5 12h5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'compass':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 9l-2 5-4 1 2-5 4-1z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'code':
      return (
        <svg {...common}>
          <path
            d="M9 8l-4 4 4 4M15 8l4 4-4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'shield':
      return (
        <svg {...common}>
          <path
            d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'grid':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="4" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="4" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
          <rect x="13" y="13" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'users':
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M4 19c0-2.8 2.2-5 5-5s5 2.2 5 5M16 7a3 3 0 010 6M20 19c0-2.2-1.2-4-3-4.6"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="5" y="5" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}
