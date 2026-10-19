import type { ReactNode } from 'react';
import { CMS_PAGE_SIZES } from '@/constants';

/** 表格列定义 */
export interface DataTableColumn<T> {
  /** 列键（唯一） */
  key: string;
  /** 列标题 */
  title: string;
  /** 列宽（如 '120px' / '20%'） */
  width?: string;
  /** 对齐方式，默认 left */
  align?: 'left' | 'center' | 'right';
  /** 自定义单元格渲染；未提供则按 `row[key]` 原样展示 */
  render?: (row: T, index: number) => ReactNode;
}

/** 分页配置 */
export interface DataTablePagination {
  /** 当前页（从 1 开始） */
  page: number;
  /** 每页条数 */
  size: number;
  /** 总条数 */
  total: number;
  /** 页码或每页条数变化回调 */
  onChange: (page: number, size: number) => void;
}

export interface DataTableProps<T> {
  /** 列定义 */
  columns: DataTableColumn<T>[];
  /** 数据行 */
  rows: T[];
  /** 行键提取函数 */
  rowKey: (row: T) => string | number;
  /** 是否加载中 */
  loading?: boolean;
  /** 空态文案 */
  emptyText?: string;
  /** 分页配置（不传则不显示分页器） */
  pagination?: DataTablePagination;
  /** 行点击回调 */
  onRowClick?: (row: T) => void;
}

/** 对齐类名 */
const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/**
 * 通用数据表格（泛型）。
 *
 * - 列渲染支持插槽式 `render`（操作按钮等由使用方提供，不内置死板按钮）。
 * - 加载态与空态分别展示。
 * - `overflow-x-auto` 保证窄屏不撑破布局。
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyText = '暂无数据',
  pagination,
  onRowClick,
}: DataTableProps<T>) {
  /** 页码按钮序列（最多展示 7 个页码，超出用省略号） */
  const renderPageNumbers = (page: number, totalPages: number): (number | '...')[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | '...')[] = [];
    const push = (v: number | '...') => pages.push(v);

    push(1);
    if (page > 3) {
      push('...');
    }
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);
    for (let i = start; i <= end; i++) {
      push(i);
    }
    if (page < totalPages - 2) {
      push('...');
    }
    push(totalPages);
    return pages;
  };

  const totalPages = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.size)) : 1;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-bg-soft">
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={`px-4 py-3 font-medium text-text-secondary ${
                    ALIGN_CLASS[col.align ?? 'left']
                  }`}
                >
                  {col.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* 加载态：骨架行 */}
            {loading &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border last:border-b-0">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <span className="block h-4 w-3/4 animate-pulse rounded bg-bg-soft" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* 空态 */}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-16 text-center text-text-muted">
                  {emptyText}
                </td>
              </tr>
            )}

            {/* 数据行 */}
            {!loading &&
              rows.map((row, index) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`border-b border-border last:border-b-0 ${
                    onRowClick ? 'cursor-pointer hover:bg-bg-soft' : ''
                  }`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 text-text ${ALIGN_CLASS[col.align ?? 'left']}`}
                    >
                      {col.render
                        ? col.render(row, index)
                        : ((row as Record<string, ReactNode>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* 分页器 */}
      {pagination && !loading && pagination.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <span>共 {pagination.total} 条</span>
            <select
              value={pagination.size}
              onChange={(e) => pagination.onChange(1, Number(e.target.value))}
              className="rounded-btn border border-border bg-white px-2 py-1 text-sm text-text focus:border-primary focus:outline-none"
              aria-label="每页条数"
            >
              {CMS_PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} 条/页
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => pagination.onChange(pagination.page - 1, pagination.size)}
              className="rounded-btn border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text-secondary"
            >
              上一页
            </button>

            {renderPageNumbers(pagination.page, totalPages).map((p, i) =>
              p === '...' ? (
                <span key={`ellipsis-${i}`} className="px-2 text-text-muted">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => pagination.onChange(p, pagination.size)}
                  className={`min-w-[2rem] rounded-btn border px-2 py-1.5 text-sm transition-colors ${
                    p === pagination.page
                      ? 'border-primary bg-primary-light text-primary'
                      : 'border-border text-text-secondary hover:border-primary hover:text-primary'
                  }`}
                >
                  {p}
                </button>
              ),
            )}

            <button
              type="button"
              disabled={pagination.page >= totalPages}
              onClick={() => pagination.onChange(pagination.page + 1, pagination.size)}
              className="rounded-btn border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:text-text-secondary"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
