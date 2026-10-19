import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { CMS_PAGE_SIZES, MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import { TextField } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import {
  createAdmin,
  deleteAdmin,
  fetchAdminList,
  resetAdminPassword,
  toggleAdminStatus,
} from '@/services/cms';
import type { AdminCredentialResult, AdminListData, AdminListItem } from '@/types';

/** 账号名规则（与后端 AdminValidate::checkUsername 保持一致） */
const USERNAME_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{2,49}$/;
const USERNAME_HINT = '以字母开头，3~50 位，仅可含字母、数字、下划线或短横线';

/**
 * 「停用」按钮的禁用原因（空串 = 可用）
 *
 * 与后端 `AdminService::toggleStatus()` 的守卫顺序一致：先「不能停用自己」，再「主账号不可停用」。
 * 注意仅**停用**受限：若主账号因历史原因处于停用态，仍允许将其**启用**（否则无法恢复）。
 */
function toggleBlockedReason(row: AdminListItem): string {
  if (row.is_self) {
    return '不能停用当前登录账号';
  }
  if (row.is_primary === 1 && row.status === 1) {
    return '主账号不可停用';
  }
  return '';
}

/** 「删除」按钮的禁用原因（空串 = 可用） */
function deleteBlockedReason(row: AdminListItem): string {
  if (row.is_self) {
    return '不能删除当前登录账号';
  }
  if (row.is_primary === 1) {
    return '主账号不可删除';
  }
  return '';
}

/**
 * 账号列表 Hook（独立于内容/留言列表：接口路径 `{P}/api/admin/*` 不同）。
 */
function useAdminList() {
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<number>(CMS_PAGE_SIZES[0]);
  const [keywordInput, setKeywordInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [data, setData] = useState<AdminListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /** 请求序号：仅采纳最后一次请求的结果（丢弃快速切换时的过期响应） */
  const reqIdRef = useRef(0);

  const load = useCallback(async (): Promise<void> => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError('');

    try {
      const res = await fetchAdminList({ page, size, keyword: keyword || undefined });
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
  }, [page, size, keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  const applySearch = useCallback((): void => {
    setKeyword(keywordInput.trim());
    setPage(1);
  }, [keywordInput]);

  const resetSearch = useCallback((): void => {
    setKeywordInput('');
    setKeyword('');
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
    keywordInput,
    setKeywordInput,
    applySearch,
    resetSearch,
    changePage,
    refresh,
  };
}

/** 一次性凭据面板：展示服务端随机生成的密码，并提示立即保存 */
function CredentialPanel({
  credential,
  onDismiss,
}: {
  credential: AdminCredentialResult;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    const text = `账号：${credential.username}\n初始密码：${credential.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-accent/40 bg-accent/5 px-4 py-3">
        <p className="text-sm font-medium text-text">请立即保存该密码</p>
        <p className="mt-1 text-xs text-text-secondary">
          出于安全考虑，初始密码<b className="text-error">仅本次展示</b>
          ，关闭后无法再次查看。该账号首次登录时会被强制修改密码。
        </p>
      </div>

      <TextField label="登录账号" value={credential.username} onChange={() => {}} disabled />

      <div className="block">
        <span className="mb-1.5 block text-sm font-medium text-text">初始密码</span>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={credential.password}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-btn border border-border bg-bg-soft px-3 py-2 font-mono text-sm text-text focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void copy()}
            className="shrink-0 rounded-btn border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          我已保存，关闭
        </button>
      </div>
    </div>
  );
}

/**
 * 账号管理页（多管理员，**不含 RBAC**）。
 *
 * 能力与安全边界（**关键规则全部由后端裁决，前端只做提示与禁用**）：
 * - 列表：DataTable + 账号名关键词搜索；每行标注「当前登录」并禁用其危险按钮；
 * - 新建：仅填账号名，**密码由服务端随机生成**，一次性展示；
 * - 启用 / 停用：停用会立即踢下线（后端 `revokeAll`）；
 * - 重置密码：为他人重置，新密码一次性展示并强制对方改密；
 * - 删除：硬删除，需**输入账号名二次确认**（大小写敏感）。
 *
 * 两类「不可操作」的行（按钮置灰 + `title` 说明原因，**服务端仍会二次拦截**）：
 * 1. **当前登录账号**——停用 / 重置 / 删除全部禁用（自己把自己锁在门外）；
 * 2. **主账号**（`is_primary = 1`，即 `cms:init` 创建的初始管理员）——停用 / 删除禁用。
 *    它**不代表更高权限**（管理员之间权限等同），只是防止初始入口被误删 / 恶意替换。
 */
export default function AccountsManage() {
  const list = useAdminList();

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });
  const showToast = (message: string, type: 'success' | 'error' = 'success'): void => {
    setToast({ open: true, message, type });
  };

  /* ---------- 一次性凭据展示 ---------- */
  const [credential, setCredential] = useState<AdminCredentialResult | null>(null);

  /* ---------- 新建 ---------- */
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  /* ---------- 启停 ---------- */
  const [toggleTarget, setToggleTarget] = useState<AdminListItem | null>(null);
  const [toggling, setToggling] = useState(false);

  /* ---------- 重置密码 ---------- */
  const [resetTarget, setResetTarget] = useState<AdminListItem | null>(null);
  const [resetting, setResetting] = useState(false);

  /* ---------- 删除 ---------- */
  const [deleteTarget, setDeleteTarget] = useState<AdminListItem | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  /** 打开新建抽屉 */
  const openCreate = (): void => {
    setCreateName('');
    setCreateError('');
    setCreateOpen(true);
  };

  /** 提交新建 */
  const handleCreate = async (): Promise<void> => {
    if (creating) {
      return;
    }
    const name = createName.trim();
    if (name === '') {
      setCreateError('请输入账号');
      return;
    }
    if (!USERNAME_PATTERN.test(name)) {
      setCreateError(USERNAME_HINT);
      return;
    }

    setCreateError('');
    setCreating(true);
    try {
      const result = await createAdmin(name);
      setCreateOpen(false);
      setCredential(result);
      await list.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  /** 确认启用 / 停用 */
  const handleToggle = async (): Promise<void> => {
    if (!toggleTarget || toggling) {
      return;
    }
    const target = toggleTarget;
    const nextStatus = target.status === 1 ? 0 : 1;

    setToggling(true);
    try {
      await toggleAdminStatus(target.id, nextStatus);
      showToast(nextStatus === 1 ? '账号已启用' : '账号已停用，相关会话已失效');
      setToggleTarget(null);
      await list.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR, 'error');
      setToggleTarget(null);
    } finally {
      setToggling(false);
    }
  };

  /** 确认重置密码 */
  const handleReset = async (): Promise<void> => {
    if (!resetTarget || resetting) {
      return;
    }
    const target = resetTarget;
    setResetting(true);
    try {
      const result = await resetAdminPassword(target.id);
      setResetTarget(null);
      setCredential(result);
      await list.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR, 'error');
      setResetTarget(null);
    } finally {
      setResetting(false);
    }
  };

  /** 确认删除（需账号名完全一致） */
  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;

    if (deleteConfirmName.trim() !== target.username) {
      showToast('账号名不一致，已取消删除', 'error');
      return;
    }

    setDeleting(true);
    try {
      await deleteAdmin(target.id, deleteConfirmName.trim());
      showToast('账号已删除');
      setDeleteTarget(null);
      setDeleteConfirmName('');
      await list.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR, 'error');
      setDeleteTarget(null);
      setDeleteConfirmName('');
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<DataTableColumn<AdminListItem>[]>(
    () => [
      { key: 'id', title: 'ID', width: '70px' },
      {
        key: 'username',
        title: '账号',
        width: '240px',
        render: (row): ReactNode => (
          <span className="flex items-center gap-2">
            <span className="font-medium text-text">{row.username}</span>
            {row.is_primary === 1 && (
              <span className="rounded-btn border border-primary/40 px-2 py-0.5 text-xs text-primary">
                主账号
              </span>
            )}
            {row.is_self && (
              <span className="rounded-btn bg-primary-light px-2 py-0.5 text-xs text-primary">
                当前登录
              </span>
            )}
          </span>
        ),
      },
      {
        key: 'status',
        title: '状态',
        width: '100px',
        render: (row): ReactNode => (
          <span
            className={`inline-flex items-center rounded-btn px-2 py-0.5 text-xs ${
              row.status === 1 ? 'bg-success/10 text-success' : 'bg-bg-soft text-text-muted'
            }`}
          >
            {row.status === 1 ? '启用' : '停用'}
          </span>
        ),
      },
      {
        key: 'must_change_password',
        title: '密码状态',
        width: '110px',
        render: (row): ReactNode =>
          row.must_change_password === 1 ? (
            <span className="inline-flex items-center rounded-btn bg-accent/10 px-2 py-0.5 text-xs text-accent">
              需改密
            </span>
          ) : (
            <span className="text-xs text-text-muted">正常</span>
          ),
      },
      {
        key: 'last_login_at',
        title: '最近登录',
        width: '170px',
        render: (row) => (row.last_login_at ? row.last_login_at : '-'),
      },
      {
        key: 'created_at',
        title: '创建时间',
        width: '170px',
      },
      {
        key: 'actions',
        title: '操作',
        width: '230px',
        align: 'right',
        render: (row): ReactNode => {
          const toggleReason = toggleBlockedReason(row);
          const deleteReason = deleteBlockedReason(row);

          return (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setToggleTarget(row)}
                disabled={toggleReason !== ''}
                title={toggleReason || undefined}
                className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary"
              >
                {row.status === 1 ? '停用' : '启用'}
              </button>
              <button
                type="button"
                onClick={() => setResetTarget(row)}
                disabled={row.is_self}
                title={row.is_self ? '请在「修改密码」中修改自己的密码' : undefined}
                className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary"
              >
                重置密码
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteConfirmName('');
                  setDeleteTarget(row);
                }}
                disabled={deleteReason !== ''}
                title={deleteReason || undefined}
                className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-error hover:text-error disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border disabled:hover:text-text-secondary"
              >
                删除
              </button>
            </div>
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏：关键词搜索 + 新建 */}
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
          placeholder="搜索账号"
          className="w-full min-w-[200px] flex-1 rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none sm:w-auto"
        />
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
        <button
          type="button"
          onClick={openCreate}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          新建账号
        </button>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<AdminListItem>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无账号数据"
        pagination={{
          page: list.page,
          size: list.size,
          total: list.total,
          onChange: list.changePage,
        }}
      />

      {/* 新建账号 */}
      <FormDrawer
        open={createOpen}
        title="新建账号"
        onClose={() => {
          if (!creating) {
            setCreateOpen(false);
          }
        }}
        loading={creating}
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <TextField
            label="登录账号"
            value={createName}
            onChange={(v) => {
              setCreateName(v);
              if (createError) {
                setCreateError('');
              }
            }}
            required
            maxLength={50}
            placeholder="如 editor01"
            error={createError}
          />
          <p className="rounded-btn border border-border bg-bg-soft px-3 py-2 text-xs text-text-secondary">
            初始密码由服务端随机生成，创建后<b className="text-text">仅展示一次</b>
            ，请立即保存并交付给使用者。该账号首次登录时会被强制修改密码。
          </p>

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
              className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={creating}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? '创建中…' : '创建'}
            </button>
          </div>
        </form>
      </FormDrawer>

      {/* 一次性凭据展示 */}
      <FormDrawer
        open={credential !== null}
        title={credential ? `账号凭据：${credential.username}` : '账号凭据'}
        onClose={() => setCredential(null)}
      >
        {credential && (
          <CredentialPanel credential={credential} onDismiss={() => setCredential(null)} />
        )}
      </FormDrawer>

      {/* 启用 / 停用确认 */}
      <ConfirmDialog
        open={toggleTarget !== null}
        title={toggleTarget?.status === 1 ? '停用账号' : '启用账号'}
        content={
          toggleTarget
            ? toggleTarget.status === 1
              ? `确定停用账号「${toggleTarget.username}」吗？停用后该账号将无法登录，其在线会话会被立即作废。`
              : `确定启用账号「${toggleTarget.username}」吗？启用后该账号可正常登录。`
            : ''
        }
        confirmText={toggleTarget?.status === 1 ? '停用' : '启用'}
        danger={toggleTarget?.status === 1}
        loading={toggling}
        onConfirm={() => void handleToggle()}
        onCancel={() => {
          if (!toggling) {
            setToggleTarget(null);
          }
        }}
      />

      {/* 重置密码确认 */}
      <ConfirmDialog
        open={resetTarget !== null}
        title="重置密码"
        content={
          resetTarget
            ? `确定重置账号「${resetTarget.username}」的密码吗？重置后将生成随机新密码（仅展示一次），该账号的在线会话会立即作废。`
            : ''
        }
        confirmText="重置"
        loading={resetting}
        onConfirm={() => void handleReset()}
        onCancel={() => {
          if (!resetting) {
            setResetTarget(null);
          }
        }}
      />

      {/* 删除确认（需输入账号名） */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除账号"
        content={
          deleteTarget ? (
            <div className="flex flex-col gap-3">
              <p>
                确定<b className="text-error"> 永久删除 </b>账号「{deleteTarget.username}
                」吗？此操作不可恢复，且会立即作废其全部会话。
              </p>
              <div>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-text-secondary">
                    请输入账号名 <b className="text-text">{deleteTarget.username}</b> 以确认：
                  </span>
                  <input
                    type="text"
                    value={deleteConfirmName}
                    onChange={(e) => setDeleteConfirmName(e.target.value)}
                    placeholder={deleteTarget.username}
                    className="w-full rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
                  />
                </label>
              </div>
            </div>
          ) : (
            ''
          )
        }
        confirmText="永久删除"
        danger
        loading={deleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => {
          if (!deleting) {
            setDeleteTarget(null);
            setDeleteConfirmName('');
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
