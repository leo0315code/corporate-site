import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  CMS_PAGE_SIZES,
  MESSAGES,
  OPLOG_MODULES,
  OPLOG_RESULTS,
  oplogActionLabel,
  oplogModuleLabel,
  oplogResultLabel,
} from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import FormDrawer from '@/components/cms/FormDrawer';
import Toast from '@/components/common/Toast';
import { DateField, SelectField, TextField } from '@/components/cms/FormFields';
import { fetchOpLogDetail, fetchOpLogList } from '@/services/cms';
import type { OpLogItem, OpLogListData } from '@/types';

/* ---------- 时间工具（本页局部，YYYY-MM-DD） ---------- */

/** 将 Date 格式化为 `YYYY-MM-DD`（本地时区，避免 toISOString 的 UTC 偏移） */
function toDateInput(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 最近 7 天窗口（含今天）：start=今天-6 天，end=今天 */
function defaultRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 6);
  return { start: toDateInput(start), end: toDateInput(end) };
}

/** 筛选表单状态（与 OpLogQuery 对齐；select 用字符串以适配受控下拉） */
interface FilterState {
  module: string;
  adminName: string;
  result: string;
  keyword: string;
  start: string;
  end: string;
}

/** 由「默认最近 7 天」构造初始筛选态 */
function initialFilter(): FilterState {
  const { start, end } = defaultRange();
  return { module: '', adminName: '', result: '', keyword: '', start, end };
}

/** 结果下拉选项（全部 / 成功 / 失败） */
const RESULT_OPTIONS = [
  { label: '全部', value: '' },
  ...OPLOG_RESULTS.map((r) => ({ label: oplogResultLabel(r), value: String(r) })),
];

/** 模块下拉选项（全部 + 枚举→中文） */
const MODULE_OPTIONS = [
  { label: '全部', value: '' },
  ...OPLOG_MODULES.map((m) => ({ label: oplogModuleLabel(m), value: m })),
];

/**
 * 日志列表 Hook（独立于其它列表：接口路径 `{P}/api/oplog/*`）。
 *
 * 采用 `reqIdRef` 丢弃过期响应（与 `AccountsManage` 的 `useAdminList` 同模式），
 * 避免快速切换筛选时旧请求覆盖新结果。
 */
function useOpLogList() {
  const [filter, setFilter] = useState<FilterState>(initialFilter);
  /** 已「生效」的筛选（点击查询后从输入态复制），驱动实际请求 */
  const [applied, setApplied] = useState<FilterState>(initialFilter);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(CMS_PAGE_SIZES[0]);
  const [data, setData] = useState<OpLogListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reqIdRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');

    try {
      const res = await fetchOpLogList({
        page,
        size,
        module: applied.module || undefined,
        admin_name: applied.adminName.trim() || undefined,
        result: applied.result === '' ? undefined : Number(applied.result),
        keyword: applied.keyword.trim() || undefined,
        start_date: applied.start || undefined,
        end_date: applied.end || undefined,
      });
      if (reqId !== reqIdRef.current) {
        return;
      }
      setData(res);
    } catch (err) {
      if (reqId !== reqIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : '列表加载失败');
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
      }
    }
  }, [page, size, applied]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 应用筛选：复制输入态 → 生效态，并回到第 1 页 */
  const applySearch = useCallback((): void => {
    setApplied({ ...filter });
    setPage(1);
  }, [filter]);

  /** 重置：清空全部筛选 + 回到最近 7 天 + 第 1 页 */
  const resetSearch = useCallback((): void => {
    const fresh = initialFilter();
    setFilter(fresh);
    setApplied(fresh);
    setPage(1);
  }, []);

  const changePage = useCallback((nextPage: number, nextSize: number): void => {
    setSize(nextSize);
    setPage(nextPage);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    await load();
  }, [load]);

  return {
    rows: data?.items ?? [],
    total: data?.total ?? 0,
    page,
    size,
    loading,
    error,
    filter,
    setFilter,
    applySearch,
    resetSearch,
    changePage,
    refresh,
  };
}

/**
 * 操作日志查询页（**只读**）。
 *
 * 能力：
 * - 筛选：模块 / 操作人 / 结果 / 关键词 / 起止日期（默认最近 7 天）；
 * - 列表：8 列（时间 / 操作人 / 模块 / 动作 / 目标对象 / 结果 / IP / 详情）；
 * - 详情：只读抽屉，展示全部 12 字段（含 UA 与完整 detail）；
 * - 分页：10/20/50（复用 `CMS_PAGE_SIZES`）。
 *
 * 边界（PRD §5.1 / §8.2 / §9）：
 * - **无任何编辑 / 删除入口**——审计流水只增不改；
 * - 列表不展示 `user_agent` / `detail`（放详情），避免列过宽；
 * - 未登录 / Token 失效由 `cms.ts` 的 `guard → handleAuthError` 自动分流（1003 跳登录、1006 跳改密）。
 */
export default function LogsManage() {
  const list = useOpLogList();

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });
  const showToast = (message: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ open: true, message, type });
  };

  /* ---------- 详情抽屉 ---------- */
  const [detail, setDetail] = useState<OpLogItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const openDetail = useCallback(
    async (row: OpLogItem): Promise<void> => {
      // 先用行内已有数据即时展示，再拉取完整详情（含可能被列表裁剪的字段）
      setDetail(row);
      setDetailLoading(true);
      try {
        const full = await fetchOpLogDetail(row.id);
        setDetail(full);
      } catch (err) {
        showToast(err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR, 'error');
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const columns = useMemo<DataTableColumn<OpLogItem>[]>(
    () => [
      { key: 'created_at', title: '时间', width: '170px' },
      {
        key: 'admin_name',
        title: '操作人',
        width: '120px',
        render: (row): ReactNode =>
          row.admin_name ? (
            <span className="font-medium text-text">{row.admin_name}</span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      {
        key: 'module',
        title: '模块',
        width: '110px',
        render: (row) => oplogModuleLabel(row.module),
      },
      {
        key: 'action',
        title: '动作',
        width: '100px',
        render: (row) => oplogActionLabel(row.action),
      },
      {
        key: 'target',
        title: '目标对象',
        width: '200px',
        render: (row): ReactNode => (
          <span className="flex flex-col">
            <span className="truncate text-text" title={row.target || undefined}>
              {row.target || '—'}
            </span>
            {row.target_name && (
              <span className="truncate text-xs text-text-muted" title={row.target_name}>
                {row.target_name}
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'result',
        title: '结果',
        width: '90px',
        render: (row): ReactNode => (
          <span
            className={`inline-flex items-center rounded-btn px-2 py-0.5 text-xs ${
              row.result === 1 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
            }`}
          >
            {oplogResultLabel(row.result)}
          </span>
        ),
      },
      { key: 'ip', title: 'IP', width: '140px' },
      {
        key: 'actions',
        title: '操作',
        width: '80px',
        align: 'right',
        render: (row): ReactNode => (
          <button
            type="button"
            onClick={() => void openDetail(row)}
            className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            详情
          </button>
        ),
      },
    ],
    [openDetail],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 筛选区 */}
      <div className="rounded-md border border-border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <SelectField
            label="模块"
            value={list.filter.module}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, module: v }))}
            options={MODULE_OPTIONS}
          />
          <TextField
            label="操作人"
            value={list.filter.adminName}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, adminName: v }))}
            placeholder="账号名（精确匹配）"
          />
          <SelectField
            label="结果"
            value={list.filter.result}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, result: v }))}
            options={RESULT_OPTIONS}
          />
          <TextField
            label="关键词"
            value={list.filter.keyword}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, keyword: v }))}
            placeholder="目标 / 名称 / 摘要"
          />
          <DateField
            label="开始日期"
            value={list.filter.start}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, start: v }))}
          />
          <DateField
            label="结束日期"
            value={list.filter.end}
            onChange={(v) => list.setFilter((prev) => ({ ...prev, end: v }))}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={list.applySearch}
            className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
          >
            查询
          </button>
          <button
            type="button"
            onClick={list.resetSearch}
            className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            重置
          </button>
          <span className="text-xs text-text-muted">默认查询最近 7 天；日志只读，不可修改或删除。</span>
        </div>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          <span>{list.error}</span>
          <button
            type="button"
            onClick={() => void list.refresh()}
            className="rounded-btn border border-error/40 px-3 py-1 text-xs text-error transition-colors hover:bg-error/5"
          >
            重试
          </button>
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<OpLogItem>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无操作日志"
        pagination={{
          page: list.page,
          size: list.size,
          total: list.total,
          onChange: list.changePage,
        }}
      />

      {/* 只读详情抽屉 */}
      <FormDrawer
        open={detail !== null}
        title="日志详情"
        onClose={() => setDetail(null)}
        loading={detailLoading}
      >
        {detail && <LogDetailPanel item={detail} />}
      </FormDrawer>

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}

/** 详情只读字段行 */
function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border py-3 last:border-b-0 sm:flex-row sm:gap-4">
      <span className="w-28 shrink-0 text-sm text-text-secondary">{label}</span>
      <span className="min-w-0 break-words text-sm text-text">{children}</span>
    </div>
  );
}

/**
 * 日志详情面板（**只读**，展示全部 12 字段）。
 *
 * 固定展示「日志不可修改、不可删除」提示（对应 PRD G3 与 C-P1-3.6）。
 */
function LogDetailPanel({ item }: { item: OpLogItem }) {
  return (
    <div className="flex flex-col">
      <p className="mb-3 rounded-btn border border-border bg-bg-soft px-3 py-2 text-xs text-text-secondary">
        操作日志为审计流水，<b className="text-text">不可修改、不可删除</b>。
      </p>

      <DetailRow label="日志 ID">{item.id}</DetailRow>
      <DetailRow label="时间">{item.created_at}</DetailRow>
      <DetailRow label="操作人">
        {item.admin_name || '—'}
        {item.admin_id > 0 && <span className="ml-2 text-xs text-text-muted">（ID: {item.admin_id}）</span>}
      </DetailRow>
      <DetailRow label="模块">{oplogModuleLabel(item.module)}</DetailRow>
      <DetailRow label="动作">{oplogActionLabel(item.action)}</DetailRow>
      <DetailRow label="目标对象">
        <span className="flex flex-col gap-0.5">
          <span className="break-all">{item.target || '—'}</span>
          {item.target_name && <span className="text-xs text-text-muted">{item.target_name}</span>}
        </span>
      </DetailRow>
      <DetailRow label="结果">
        <span
          className={`inline-flex items-center rounded-btn px-2 py-0.5 text-xs ${
            item.result === 1 ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
          }`}
        >
          {oplogResultLabel(item.result)}
        </span>
      </DetailRow>
      <DetailRow label="IP">{item.ip || '—'}</DetailRow>
      <DetailRow label="User-Agent">
        <span className="break-all text-xs text-text-secondary">{item.user_agent || '—'}</span>
      </DetailRow>
      <DetailRow label="详情摘要">
        <span className="whitespace-pre-wrap break-words">{item.detail || '—'}</span>
      </DetailRow>
    </div>
  );
}
