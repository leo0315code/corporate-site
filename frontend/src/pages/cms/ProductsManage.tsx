import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ID_PREFIX, MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import { TextAreaField, TextField, TagListField } from '@/components/cms/FormFields';
import IdField from '@/components/cms/IdField';
import ImageField from '@/components/cms/ImageField';
import Toast from '@/components/common/Toast';
import { deleteContent, saveContent } from '@/services/cms';
import type { Product } from '@/types';
import { generateContentId } from '@/utils/contentId';
import { useContentList } from './useContentList';

/** 空表单初始值（id 由系统自动生成） */
function emptyForm(): Product {
  return {
    id: generateContentId(ID_PREFIX.product),
    category: '',
    name: '',
    summary: '',
    description: '',
    features: [],
    image: '',
    icon: '',
  };
}

/** 表单字段错误（键为字段名） */
type FormErrors = Partial<Record<keyof Product, string>>;

/** 长度上限（与后端 ContentValidate scene=product 对齐） */
const LIMITS = {
  id: 80,
  category: 30,
  name: 60,
  summary: 200,
  description: 20000,
  image: 255,
  icon: 30,
} as const;

/**
 * 产品管理页。
 *
 * - 列表：DataTable + 关键词搜索（**显式「搜索」按钮**，不用防抖）+ 分类筛选。
 * - 新增 / 编辑：右侧 **FormDrawer 抽屉** 承载表单；`_editing` 标记区分新增 / 编辑。
 * - 删除：ConfirmDialog（danger）二次确认；删除末页唯一一条回退页码。
 * - 校验：前端即时（必填 + 长度），最终以后端 `code/message` 为准；错误展示到表单顶部与字段。
 */
export default function ProductsManage() {
  const list = useContentList<Product>('product');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Product>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 更新单个表单字段并清除该字段错误 */
  const updateField = <K extends keyof Product>(key: K, value: Product[K]): void => {
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
  const openEdit = (row: Product): void => {
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

    if (form.category.trim() === '') {
      next.category = '请填写分类';
    } else if (form.category.length > LIMITS.category) {
      next.category = `分类不得超过 ${LIMITS.category} 个字符`;
    }

    if (form.name.trim() === '') {
      next.name = '请填写名称';
    } else if (form.name.length > LIMITS.name) {
      next.name = `名称不得超过 ${LIMITS.name} 个字符`;
    }

    if (form.summary.trim() === '') {
      next.summary = '请填写简介';
    } else if (form.summary.length > LIMITS.summary) {
      next.summary = `简介不得超过 ${LIMITS.summary} 个字符`;
    }

    if (form.description.trim() === '') {
      next.description = '请填写详情';
    } else if (form.description.length > LIMITS.description) {
      next.description = '详情长度超出上限';
    }

    if (form.image.length > LIMITS.image) {
      next.image = `图片路径不得超过 ${LIMITS.image} 个字符`;
    }

    if (form.icon.length > LIMITS.icon) {
      next.icon = `图标标识不得超过 ${LIMITS.icon} 个字符`;
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
      const payload: Product & { _editing?: boolean } = {
        ...form,
        id: form.id.trim(),
        category: form.category.trim(),
        name: form.name.trim(),
        summary: form.summary.trim(),
        description: form.description,
        image: form.image.trim(),
        icon: form.icon.trim(),
        features: form.features.map((f) => f.trim()).filter((f) => f !== ''),
      };
      if (editing) {
        payload._editing = true;
      }

      await saveContent<Product>('product', payload);
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
      await deleteContent('product', target.id);
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

  const columns = useMemo<DataTableColumn<Product>[]>(
    () => [
      { key: 'id', title: 'ID', width: '180px' },
      { key: 'name', title: '名称' },
      { key: 'category', title: '分类', width: '120px' },
      { key: 'icon', title: '图标', width: '100px' },
      {
        key: 'features',
        title: '特点',
        width: '100px',
        render: (row) => `${row.features.length} 项`,
      },
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
          placeholder="搜索名称 / 简介"
          className="w-full min-w-[200px] flex-1 rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none sm:w-auto"
        />
        <input
          type="text"
          value={list.selectedCategory}
          onChange={(e) => list.setSelectedCategory(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              list.applySearch();
            }
          }}
          placeholder="分类筛选"
          className="w-full rounded-btn border border-border bg-white px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none sm:w-40"
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
          + 新增产品
        </button>
      </div>

      {/* 列表错误提示 */}
      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      {/* 数据表格 */}
      <DataTable<Product>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无产品数据"
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
        title={editing ? '编辑产品' : '新增产品'}
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
            generator={() => generateContentId(ID_PREFIX.product)}
            required
            error={errors.id}
            placeholder="如 product-cloud"
            maxLength={LIMITS.id}
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="分类"
              value={form.category}
              onChange={(v) => updateField('category', v)}
              required
              error={errors.category}
              placeholder="如 解决方案"
              maxLength={LIMITS.category}
              disabled={saving}
            />
            <TextField
              label="名称"
              value={form.name}
              onChange={(v) => updateField('name', v)}
              required
              error={errors.name}
              placeholder="如 云服务"
              maxLength={LIMITS.name}
              disabled={saving}
            />
          </div>

          <TextAreaField
            label="简介"
            value={form.summary}
            onChange={(v) => updateField('summary', v)}
            required
            error={errors.summary}
            placeholder="一句话简介"
            maxLength={LIMITS.summary}
            rows={3}
            disabled={saving}
          />

          <TextAreaField
            label="详情"
            value={form.description}
            onChange={(v) => updateField('description', v)}
            required
            error={errors.description}
            placeholder="详细描述"
            maxLength={LIMITS.description}
            rows={8}
            disabled={saving}
          />

          <TagListField
            label="特点（features）"
            value={form.features}
            onChange={(v) => updateField('features', v)}
            placeholder="如 高可用"
            itemMaxLength={50}
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ImageField
              label="产品图片"
              value={form.image}
              onChange={(v) => updateField('image', v)}
              type="product"
              error={errors.image}
              disabled={saving}
            />
            <TextField
              label="图标标识"
              value={form.icon}
              onChange={(v) => updateField('icon', v)}
              error={errors.icon}
              placeholder="如 cloud"
              maxLength={LIMITS.icon}
              disabled={saving}
            />
          </div>

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
        title="删除产品"
        content={
          deleteTarget
            ? `确定删除产品「${deleteTarget.name}」（${deleteTarget.id}）吗？此操作不可恢复。`
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
