import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ID_PREFIX, MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import { TextAreaField, TextField } from '@/components/cms/FormFields';
import IdField from '@/components/cms/IdField';
import ImageField from '@/components/cms/ImageField';
import Toast from '@/components/common/Toast';
import { deleteContent, saveContent } from '@/services/cms';
import type { CaseItem } from '@/types';
import { generateContentId } from '@/utils/contentId';
import { useContentList } from './useContentList';

/** 空表单初始值（id 由系统自动生成） */
function emptyForm(): CaseItem {
  return {
    id: generateContentId(ID_PREFIX.case),
    name: '',
    logo: '',
    desc: '',
  };
}

/** 表单字段错误（键为字段名） */
type FormErrors = Partial<Record<keyof CaseItem, string>>;

/** 长度上限（与后端 ContentValidate scene=case 对齐） */
const LIMITS = {
  id: 80,
  name: 50,
  logo: 255,
  desc: 200,
} as const;

/**
 * 案例管理页。
 *
 * - 列表：DataTable + 关键词搜索（**显式「搜索」按钮**，与全站列表页统一交互）。
 * - 新增 / 编辑：右侧 **FormDrawer 抽屉**承载表单；`_editing` 标记区分新增 / 编辑。
 * - 删除：ConfirmDialog（danger）二次确认；删除末页唯一一条回退页码。
 * - 校验：前端即时（必填 + 长度），最终以后端 `code/message` 为准；错误展示到表单顶部与字段。
 */
export default function CasesManage() {
  const list = useContentList<CaseItem>('case');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<CaseItem>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<CaseItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 更新单个表单字段并清除该字段错误 */
  const updateField = <K extends keyof CaseItem>(key: K, value: CaseItem[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) {
        return prev;
      }
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  /** 打开新增抽屉 */
  const openCreate = (): void => {
    setEditing(false);
    setForm(emptyForm());
    setErrors({});
    setFormError('');
    setDrawerOpen(true);
  };

  /** 打开编辑抽屉 */
  const openEdit = (row: CaseItem): void => {
    setEditing(true);
    setForm({ ...row });
    setErrors({});
    setFormError('');
    setDrawerOpen(true);
  };

  /** 关闭抽屉（提交中不关闭） */
  const closeDrawer = (): void => {
    if (!saving) {
      setDrawerOpen(false);
    }
  };

  /** 前端即时校验（必填 + 长度） */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (form.id.trim() === '') {
      next.id = '请填写唯一标识 id';
    } else if (form.id.length > LIMITS.id) {
      next.id = `唯一标识 id 长度需为 1~${LIMITS.id} 个字符`;
    }

    if (form.name.trim() === '') {
      next.name = '请填写名称';
    } else if (form.name.length > LIMITS.name) {
      next.name = `名称不得超过 ${LIMITS.name} 个字符`;
    }

    if (form.desc.trim() === '') {
      next.desc = '请填写描述';
    } else if (form.desc.length > LIMITS.desc) {
      next.desc = `描述不得超过 ${LIMITS.desc} 个字符`;
    }

    if (form.logo.length > LIMITS.logo) {
      next.logo = `Logo 路径不得超过 ${LIMITS.logo} 个字符`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** 保存（新增 / 编辑） */
  const handleSave = async (): Promise<void> => {
    if (saving) {
      return;
    }
    setFormError('');

    if (!validate()) {
      return;
    }

    setSaving(true);
    try {
      const payload: CaseItem & { _editing?: boolean } = {
        id: form.id.trim(),
        name: form.name.trim(),
        logo: form.logo.trim(),
        desc: form.desc.trim(),
      };
      if (editing) {
        payload._editing = true;
      }

      await saveContent<CaseItem>('case', payload);
      setToast({ open: true, message: '保存成功', type: 'success' });
      setDrawerOpen(false);
      await list.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      // 后端校验/冲突错误展示到表单顶部；同时尝试定位到 id 字段
      setFormError(message);
      if (message.includes('id')) {
        setErrors((prev) => ({ ...prev, id: message }));
      }
      setToast({ open: true, message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 删除（二次确认后执行） */
  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteContent('case', target.id);
      setToast({ open: true, message: '删除成功', type: 'success' });
      setDeleteTarget(null);
      // 若删除后当前页无剩余数据则回退页码
      list.afterDelete(list.rows.length - 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setToast({ open: true, message, type: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<DataTableColumn<CaseItem>[]>(
    () => [
      { key: 'id', title: 'ID', width: '180px' },
      { key: 'name', title: '客户名称' },
      { key: 'desc', title: '描述' },
      { key: 'logo', title: 'Logo', width: '160px' },
      {
        key: 'actions',
        title: '操作',
        width: '140px',
        align: 'right',
        render: (row): ReactNode => (
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => openEdit(row)}
              className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              编辑
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
    // openEdit/setDeleteTarget 均为稳定引用或 setState，无需列为依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 工具栏 */}
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
          placeholder="搜索客户名称 / 描述"
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
          className="ml-auto rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          + 新增案例
        </button>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<CaseItem>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无案例数据"
        pagination={{
          page: list.page,
          size: list.size,
          total: list.total,
          onChange: list.changePage,
        }}
      />

      {/* 新增 / 编辑抽屉 */}
      <FormDrawer
        open={drawerOpen}
        title={editing ? '编辑案例' : '新增案例'}
        onClose={closeDrawer}
        loading={saving}
      >
        <div className="flex flex-col gap-4">
          {/* 表单顶部错误 */}
          {formError && (
            <div className="rounded-btn border border-error/30 bg-white px-3 py-2 text-sm text-error">
              {formError}
            </div>
          )}

          <IdField
            value={form.id}
            onChange={(v) => updateField('id', v)}
            editing={editing}
            generator={() => generateContentId(ID_PREFIX.case)}
            required
            error={errors.id}
            placeholder="如 case-client-a"
            maxLength={LIMITS.id}
            disabled={saving}
          />

          <TextField
            label="客户名称"
            value={form.name}
            onChange={(v) => updateField('name', v)}
            required
            error={errors.name}
            placeholder="如 某制造集团"
            maxLength={LIMITS.name}
            disabled={saving}
          />

          <ImageField
            label="客户 Logo"
            value={form.logo}
            onChange={(v) => updateField('logo', v)}
            type="case"
            error={errors.logo}
            disabled={saving}
          />

          <TextAreaField
            label="描述"
            value={form.desc}
            onChange={(v) => updateField('desc', v)}
            required
            error={errors.desc}
            placeholder="案例简要描述"
            maxLength={LIMITS.desc}
            rows={3}
            disabled={saving}
          />

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={closeDrawer}
              disabled={saving}
              className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </FormDrawer>

      {/* 删除确认 */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除案例"
        content={
          deleteTarget
            ? `确定删除案例「${deleteTarget.name}」（${deleteTarget.id}）吗？此操作不可恢复。`
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
