import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import { TextAreaField, TextField } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import { deleteContent, saveContent } from '@/services/cms';
import type { AdvantageItem } from '@/types';
import { useContentList } from './useContentList';

/**
 * 优势表单（内部态）。
 *
 * 说明：`advantage` 为**自增主键**，与 product/news/case 的 slug 主键语义不同 ——
 * 因此表单不把 `id` 建模为可编辑输入，而用 `sortOrder` 这一可选高级字段承载排序。
 * 编辑 `id` 由外部 `editingId` 单独持有（新增为 null）。
 */
interface AdvantageForm {
  value: string;
  label: string;
  desc: string;
  /** 排序值（留空表示不提交），越小越靠前 */
  sortOrder: string;
}

/** 空表单初始值 */
function emptyForm(): AdvantageForm {
  return {
    value: '',
    label: '',
    desc: '',
    sortOrder: '',
  };
}

/** 表单字段错误 */
type FormErrors = Partial<Record<keyof AdvantageForm, string>>;

/** 长度上限（与后端 ContentValidate scene=advantage 对齐） */
const LIMITS = {
  value: 20,
  label: 30,
  desc: 100,
} as const;

/** 提交载荷：带 id=编辑，无 id=新增（对齐后端 advantage 保存语义） */
interface AdvantageSubmitPayload {
  id?: number;
  value: string;
  label: string;
  desc: string;
  sort_order?: number;
}

/**
 * 优势管理页。
 *
 * - 列表：DataTable + 关键词搜索（**显式「搜索」按钮**，与全站列表页统一交互）。
 * - 新增 / 编辑：右侧 **FormDrawer 抽屉**。**保存语义与 slug 主键类型不同**：
 *   编辑时载荷**携带 `id`**，新增时**不携带 `id`**（后端按有无 `id` 判定增改）。
 * - 删除：ConfirmDialog（danger）二次确认，删除时传**数字 id**；删空末页回退页码。
 * - 校验：前端即时（必填 + 长度 + 排序整数），最终以后端 `code/message` 为准。
 */
export default function AdvantagesManage() {
  const list = useContentList<AdvantageItem>('advantage');

  const [drawerOpen, setDrawerOpen] = useState(false);
  /** 当前编辑项的自增 id；null 表示新增 */
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<AdvantageForm>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AdvantageItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 更新单个表单字段并清除该字段错误 */
  const updateField = <K extends keyof AdvantageForm>(key: K, value: AdvantageForm[K]): void => {
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
    setEditingId(null);
    setForm(emptyForm());
    setErrors({});
    setFormError('');
    setDrawerOpen(true);
  };

  /** 打开编辑抽屉 */
  const openEdit = (row: AdvantageItem): void => {
    // 后端列表行含 sort_order（TS 类型未声明，此处安全读取）
    const sortOrder = (row as AdvantageItem & { sort_order?: number }).sort_order;
    setEditingId(row.id);
    setForm({
      value: row.value,
      label: row.label,
      desc: row.desc,
      sortOrder: sortOrder === undefined || sortOrder === null ? '' : String(sortOrder),
    });
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

  /** 前端即时校验（必填 + 长度 + 排序整数） */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (form.value.trim() === '') {
      next.value = '请填写展示数值';
    } else if (form.value.length > LIMITS.value) {
      next.value = `展示数值不得超过 ${LIMITS.value} 个字符`;
    }

    if (form.label.trim() === '') {
      next.label = '请填写标签';
    } else if (form.label.length > LIMITS.label) {
      next.label = `标签不得超过 ${LIMITS.label} 个字符`;
    }

    if (form.desc.length > LIMITS.desc) {
      next.desc = `说明不得超过 ${LIMITS.desc} 个字符`;
    }

    const sortRaw = form.sortOrder.trim();
    if (sortRaw !== '' && !/^-?\d+$/.test(sortRaw)) {
      next.sortOrder = '排序值需为整数';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** 保存（带 id=编辑 / 不带 id=新增） */
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
      const payload: AdvantageSubmitPayload = {
        value: form.value.trim(),
        label: form.label.trim(),
        desc: form.desc.trim(),
      };
      // 仅编辑时携带 id；新增**绝不**把 id 塞进 body
      if (editingId !== null) {
        payload.id = editingId;
      }
      // 仅显式填写排序值时才提交（留空则后端保持默认 / 原值）
      const sortRaw = form.sortOrder.trim();
      if (sortRaw !== '') {
        payload.sort_order = Number(sortRaw);
      }

      await saveContent<AdvantageItem>('advantage', payload);
      setToast({ open: true, message: '保存成功', type: 'success' });
      setDrawerOpen(false);
      await list.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setFormError(message);
      setToast({ open: true, message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 删除（二次确认后执行，传数字 id） */
  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteContent('advantage', target.id);
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

  const columns = useMemo<DataTableColumn<AdvantageItem>[]>(
    () => [
      { key: 'id', title: 'ID', width: '80px' },
      { key: 'value', title: '展示数值', width: '140px' },
      { key: 'label', title: '标签', width: '200px' },
      { key: 'desc', title: '说明' },
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
          placeholder="搜索数值 / 标签 / 说明"
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
          + 新增优势
        </button>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<AdvantageItem>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无优势数据"
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
        title={editingId !== null ? '编辑优势' : '新增优势'}
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

          <TextField
            label="展示数值"
            value={form.value}
            onChange={(v) => updateField('value', v)}
            required
            error={errors.value}
            placeholder="如 300+"
            maxLength={LIMITS.value}
            disabled={saving}
          />

          <TextField
            label="标签"
            value={form.label}
            onChange={(v) => updateField('label', v)}
            required
            error={errors.label}
            placeholder="如 服务企业客户"
            maxLength={LIMITS.label}
            disabled={saving}
          />

          <TextAreaField
            label="说明"
            value={form.desc}
            onChange={(v) => updateField('desc', v)}
            error={errors.desc}
            placeholder="一句话说明（选填）"
            maxLength={LIMITS.desc}
            rows={3}
            disabled={saving}
          />

          <TextField
            label="排序值"
            value={form.sortOrder}
            onChange={(v) => updateField('sortOrder', v)}
            error={errors.sortOrder}
            placeholder="留空则按默认顺序（越小越靠前）"
            type="number"
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
        title="删除优势"
        content={
          deleteTarget
            ? `确定删除优势「${deleteTarget.label}」（ID ${deleteTarget.id}）吗？此操作不可恢复。`
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
