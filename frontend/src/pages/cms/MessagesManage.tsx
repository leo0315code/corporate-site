import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CMS_PAGE_SIZES, MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import Toast from '@/components/common/Toast';
import { deleteMessage, fetchMessageDetail, fetchMessageList, markMessageStatus } from '@/services/cms';
import type { MessageListAdminData, MessageRecordAdmin } from '@/types';

/** 状态筛选值：''=全部, 0=待处理, 1=已处理 */
type StatusFilter = '' | 0 | 1;

/** 状态筛选选项 */
const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: '全部', value: '' },
  { label: '待处理', value: 0 },
  { label: '已处理', value: 1 },
];

/**
 * 留言列表状态 Hook（**独立于 `useContentList`**）。
 *
 * 留言接口路径（`{P}/api/message/*`）与内容接口（`{P}/api/content/*`）不同，
 * 且需承载**状态筛选**（区分「全部」与「待处理 0」），故不复用绑定 content 类型的
 * `useContentList`，单列一个自洽的查询 Hook。
 */
function useMessageList(initialStatus: StatusFilter = '') {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(CMS_PAGE_SIZES[0]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusInput, setStatusInput] = useState<StatusFilter>(initialStatus);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [data, setData] = useState<MessageListAdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** 请求序号：仅最后一次请求的结果被采纳（丢弃快速切换时的过期响应） */
  const reqIdRef = useRef(0);

  /** 加载当前查询条件下的列表 */
  const load = useCallback(async (): Promise<void> => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');

    try {
      const res = await fetchMessageList({
        page,
        size,
        keyword: keyword || undefined,
        // status 仅在明确选择「待处理 / 已处理」时传入；「全部」不传
        status: status === '' ? undefined : status,
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
  }, [page, size, keyword, status]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 应用筛选：提交关键词与状态并回到第 1 页 */
  const applySearch = useCallback((): void => {
    setKeyword(keywordInput.trim());
    setStatus(statusInput);
    setPage(1);
  }, [keywordInput, statusInput]);

  /** 清空筛选条件 */
  const resetSearch = useCallback((): void => {
    setKeywordInput('');
    setStatusInput('');
    setKeyword('');
    setStatus('');
    setPage(1);
  }, []);

  /** 分页变更 */
  const changePage = useCallback((nextPage: number, nextSize: number): void => {
    setSize(nextSize);
    setPage(nextPage);
  }, []);

  /** 手动刷新当前页 */
  const refresh = useCallback(async (): Promise<void> => {
    await load();
  }, [load]);

  /** 删除后处理：本页删空且非首页时回退一页，否则刷新当前页 */
  const afterDelete = useCallback(
    (remainingOnPage: number): void => {
      if (remainingOnPage <= 0 && page > 1) {
        setPage(page - 1);
      } else {
        void load();
      }
    },
    [page, load],
  );

  return {
    rows: data?.items ?? [],
    total: data?.total ?? 0,
    page,
    size,
    loading,
    error,
    keywordInput,
    setKeywordInput,
    statusInput,
    setStatusInput,
    applySearch,
    resetSearch,
    changePage,
    refresh,
    afterDelete,
  };
}

/** 内容摘要截断（列表列展示） */
function truncate(text: string, max = 40): string {
  const value = text ?? '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** 状态徽标 */
function StatusBadge({ status }: { status: number }) {
  const handled = status === 1;
  return (
    <span
      className={`inline-flex items-center rounded-btn px-2 py-0.5 text-xs ${
        handled ? 'bg-success/10 text-success' : 'bg-accent/10 text-accent'
      }`}
    >
      {handled ? '已处理' : '待处理'}
    </span>
  );
}

/**
 * 留言管理页（**只读 + 状态标记 + 删除，无新增**）。
 *
 * - 列表：DataTable + 关键词搜索（**显式「搜索」按钮**）+ 状态筛选（全部 / 待处理 / 已处理）。
 * - 详情：右侧 **FormDrawer 抽屉**，经 `GET message/detail?id=` 拉取完整内容（含 IP）。
 * - 状态：抽屉内「标记已处理 / 标记待处理」→ `POST message/status {id,status}`。
 * - 删除：ConfirmDialog（danger）→ `POST message/delete {id}`；删空末页回退页码。
 * - 列表 Hook 独立实现（**不复用绑定 content 类型的 `useContentList`**）。
 */
export default function MessagesManage() {
  const list = useMessageList('');

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<MessageRecordAdmin | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  const [statusUpdating, setStatusUpdating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<MessageRecordAdmin | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 打开详情抽屉并拉取单条完整内容 */
  const openDetail = async (row: MessageRecordAdmin): Promise<void> => {
    setDetailOpen(true);
    setDetail(row);
    setDetailError('');
    setDetailLoading(true);
    try {
      const full = await fetchMessageDetail(row.id);
      setDetail(full);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setDetailError(message);
    } finally {
      setDetailLoading(false);
    }
  };

  /** 关闭详情抽屉 */
  const closeDetail = (): void => {
    if (!statusUpdating) {
      setDetailOpen(false);
    }
  };

  /** 标记处理状态（0/1），成功后刷新列表与当前详情 */
  const handleToggleStatus = async (): Promise<void> => {
    if (!detail || statusUpdating) {
      return;
    }
    const nextStatus = detail.status === 1 ? 0 : 1;
    setStatusUpdating(true);
    try {
      await markMessageStatus(detail.id, nextStatus);
      setDetail((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      setToast({
        open: true,
        message: nextStatus === 1 ? '已标记为已处理' : '已标记为待处理',
        type: 'success',
      });
      await list.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setToast({ open: true, message, type: 'error' });
    } finally {
      setStatusUpdating(false);
    }
  };

  /** 删除（二次确认后执行） */
  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    const remainingOnPage = list.rows.length - 1;
    const fromDetail = detail?.id === target.id;
    setDeleting(true);
    try {
      await deleteMessage(target.id);
      setToast({ open: true, message: '删除成功', type: 'success' });
      setDeleteTarget(null);
      // 若从详情抽屉发起删除，关闭抽屉
      if (fromDetail) {
        setDetailOpen(false);
        setDetail(null);
      }
      // 若删除后当前页无剩余数据则回退页码
      list.afterDelete(remainingOnPage);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setToast({ open: true, message, type: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<DataTableColumn<MessageRecordAdmin>[]>(
    () => [
      { key: 'id', title: 'ID', width: '70px' },
      { key: 'name', title: '姓名', width: '110px' },
      {
        key: 'company',
        title: '公司',
        width: '140px',
        render: (row) => (row.company ? row.company : '-'),
      },
      { key: 'phone', title: '电话', width: '140px' },
      { key: 'email', title: '邮箱', width: '180px' },
      {
        key: 'content',
        title: '内容',
        render: (row) => truncate(row.content),
      },
      {
        key: 'created_at',
        title: '时间',
        width: '170px',
      },
      {
        key: 'status',
        title: '状态',
        width: '90px',
        render: (row): ReactNode => <StatusBadge status={row.status} />,
      },
      {
        key: 'actions',
        title: '操作',
        width: '150px',
        align: 'right',
        render: (row): ReactNode => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => void openDetail(row)}
              className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              详情
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(row)}
              className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-error hover:text-error"
            >
              删除
            </button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏：关键词 + 状态筛选（显式「搜索」按钮，与全站列表页统一交互） */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-white p-4">
        <input
          type="text"
          value={list.keywordInput}
          onChange={(e) => list.setKeywordInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              list.applySearch();
            }
          }}
          placeholder="搜索姓名 / 公司 / 电话 / 邮箱 / 内容"
          className="w-full min-w-[200px] flex-1 rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none sm:w-auto"
        />
        <select
          value={String(list.statusInput)}
          onChange={(e) => {
            const raw = e.target.value;
            list.setStatusInput(raw === '' ? '' : (Number(raw) as 0 | 1));
          }}
          aria-label="处理状态筛选"
          className="w-full rounded-btn border border-border bg-white px-3 py-2 text-sm text-text focus:border-primary focus:outline-none sm:w-40"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={String(opt.value)} value={String(opt.value)}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={list.applySearch}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          搜索
        </button>
        <button
          type="button"
          onClick={list.resetSearch}
          className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
        >
          重置
        </button>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<MessageRecordAdmin>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无留言数据"
        pagination={{
          page: list.page,
          size: list.size,
          total: list.total,
          onChange: list.changePage,
        }}
      />

      {/* 详情抽屉（只读 + 状态标记 + 删除） */}
      <FormDrawer
        open={detailOpen}
        title="留言详情"
        onClose={closeDetail}
        loading={statusUpdating}
      >
        {detailLoading && !detail ? (
          <p className="text-sm text-text-secondary">加载中…</p>
        ) : detail ? (
          <div className="flex flex-col gap-4">
            {detailError && (
              <div className="rounded-btn border border-error/30 bg-white px-3 py-2 text-sm text-error">
                {detailError}
              </div>
            )}

            <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DetailItem label="留言 ID" value={String(detail.id)} />
              <DetailItem label="提交时间" value={detail.created_at} />
              <DetailItem label="姓名" value={detail.name} />
              <DetailItem label="公司" value={detail.company ? detail.company : '-'} />
              <DetailItem label="电话" value={detail.phone} />
              <DetailItem label="邮箱" value={detail.email} />
              <DetailItem label="来源 IP" value={detail.ip} />
              <DetailItem label="处理时间" value={detail.handled_at ? detail.handled_at : '-'} />
            </dl>

            <div>
              <p className="mb-1.5 text-sm font-medium text-text">处理状态</p>
              <StatusBadge status={detail.status} />
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium text-text">留言内容</p>
              <p className="whitespace-pre-line rounded-btn border border-border bg-bg-soft px-3 py-2 text-sm text-text">
                {detail.content}
              </p>
            </div>

            <div className="flex flex-wrap justify-end gap-3 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => setDeleteTarget(detail)}
                disabled={statusUpdating}
                className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-50"
              >
                删除留言
              </button>
              <button
                type="button"
                onClick={() => void handleToggleStatus()}
                disabled={statusUpdating}
                className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {statusUpdating
                  ? '处理中…'
                  : detail.status === 1
                    ? '标记为待处理'
                    : '标记为已处理'}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">未获取到留言内容</p>
        )}
      </FormDrawer>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除留言"
        content={
          deleteTarget
            ? `确定删除来自「${deleteTarget.name}」的留言（ID ${deleteTarget.id}）吗？此操作不可恢复。`
            : ''
        }
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
          }
        }}
      />

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}

/** 详情字段项 */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-text">{value}</dd>
    </div>
  );
}
