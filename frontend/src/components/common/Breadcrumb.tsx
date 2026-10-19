import { Link } from 'react-router-dom';
import { ROUTES } from '@/constants';

export interface BreadcrumbItem {
  label: string;
  /** 目标路径；不传则视为当前页（不可点击） */
  path?: string;
}

export interface BreadcrumbProps {
  /** 面包屑条目，最后一项为当前页 */
  items: BreadcrumbItem[];
  /** 是否用于深色背景（内页标题横幅） */
  light?: boolean;
  className?: string;
}

/**
 * 内页面包屑：首页固定为第一项，其后为传入条目。
 */
export default function Breadcrumb({
  items,
  light = false,
  className = '',
}: BreadcrumbProps) {
  const linkClass = light
    ? 'text-white/70 hover:text-white'
    : 'text-text-secondary hover:text-primary';
  const currentClass = light ? 'text-white' : 'text-text';
  const sepClass = light ? 'text-white/40' : 'text-text-muted';

  return (
    <nav aria-label="面包屑" className={`text-sm ${className}`}>
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link to={ROUTES.HOME} className={linkClass}>
            首页
          </Link>
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              <span className={sepClass} aria-hidden="true">
                /
              </span>
              {item.path && !isLast ? (
                <Link to={item.path} className={linkClass}>
                  {item.label}
                </Link>
              ) : (
                <span className={currentClass} aria-current={isLast ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
