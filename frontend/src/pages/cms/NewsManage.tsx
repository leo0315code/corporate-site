import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ID_PREFIX, MESSAGES } from '@/constants';
import DataTable from '@/components/cms/DataTable';
import type { DataTableColumn } from '@/components/cms/DataTable';
import ConfirmDialog from '@/components/cms/ConfirmDialog';
import FormDrawer from '@/components/cms/FormDrawer';
import { DateField, TextAreaField, TextField } from '@/components/cms/FormFields';
import IdField from '@/components/cms/IdField';
import ImageField from '@/components/cms/ImageField';
import Toast from '@/components/common/Toast';
import { deleteContent, saveContent } from '@/services/cms';
import type { NewsItem } from '@/types';
import { generateContentId } from '@/utils/contentId';
import { useContentList } from './useContentList';

/** 空表单初始值（date 默认今天；id 由系统自动生成） */
function emptyForm(): NewsItem {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  return {
    id: generateContentId(ID_PREFIX.news),
    title: '',
    date: today,
    category: '',
    cover: '',
    summary: '',
    content: '',
  };
}

/** 表单字段错误 */
type FormErrors = Partial<Record<keyof NewsItem, string>>;

/** 长度上限（与后端 ContentValidate scene=news 对齐） */
const LIMITS = {
  id: 80,
  title: 100,
  category: 30,
  cover: 255,
  summary: 300,
  content: 20000,
} as const;

/** 严格校验 YYYY-MM-DD 且为真实日期（与后端 checkDate 一致） */
function isValidDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) {
    return false;
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  // 用 UTC 构造避免本地时区偏移影响，再回读校验（可拦截 2024-02-30 等）
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

/**
 * 新闻管理页。
 *
 * - 列表：DataTable + 关键词搜索（**显式「搜索」按钮**）+ 分类筛选。
 * - 新增 / 编辑：右侧 **FormDrawer 抽屉**；`_editing` 区分新增 / 编辑。
 * - 删除：ConfirmDialog（danger）；删空末页回退页码。
 * - 日期：`DateField`（原生 date 控件）；异常日期由后端 `checkDate` 兜底返回 1001。
 */
export default function NewsManage() {
  const list = useContentList<NewsItem>('news');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<NewsItem>(emptyForm());
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<NewsItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 更新单个字段并清除其错误 */
  const updateField = <K extends keyof NewsItem>(key: K, value: NewsItem[K]): void => {
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

  const openCreate = (): void => {
    setEditing(false);
    setForm(emptyForm());
    setErrors({});
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (row: NewsItem): void => {
    setEditing(true);
    setForm({ ...row });
    setErrors({});
    setFormError('');
    setDrawerOpen(true);
  };

  const closeDrawer = (): void => {
    if (!saving) {
      setDrawerOpen(false);
    }
  };

  /** 前端即时校验 */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (form.id.trim() === '') {
      next.id = '请填写唯一标识 id';
    } else if (form.id.length > LIMITS.id) {
      next.id = `唯一标识 id 长度需为 1~${LIMITS.id} 个字符`;
    }

    if (form.title.trim() === '') {
      next.title = '请填写标题';
    } else if (form.title.length > LIMITS.title) {
      next.title = `标题不得超过 ${LIMITS.title} 个字符`;
    }

    if (form.date.trim() === '') {
      next.date = '请填写日期';
    } else if (!isValidDate(form.date)) {
      next.date = '日期格式需为 YYYY-MM-DD';
    }

    if (form.category.trim() === '') {
      next.category = '请填写分类';
    } else if (form.category.length > LIMITS.category) {
      next.category = `分类不得超过 ${LIMITS.category} 个字符`;
    }

    if (form.cover.length > LIMITS.cover) {
      next.cover = `封面路径不得超过 ${LIMITS.cover} 个字符`;
    }

    if (form.summary.trim() === '') {
      next.summary = '请填写摘要';
    } else if (form.summary.length > LIMITS.summary) {
      next.summary = `摘要不得超过 ${LIMITS.summary} 个字符`;
    }

    if (form.content.trim() === '') {
      next.content = '请填写正文';
    } else if (form.content.length > LIMITS.content) {
      next.content = '正文长度超出上限';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** 保存 */
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
      const payload: NewsItem & { _editing?: boolean } = {
        id: form.id.trim(),
        title: form.title.trim(),
        date: form.date.trim(),
        category: form.category.trim(),
        cover: form.cover.trim(),
        summary: form.summary.trim(),
        content: form.content,
      };
      if (editing) {
        payload._editing = true;
      }

      await saveContent<NewsItem>('news', payload);
      setToast({ open: true, message: '保存成功', type: 'success' });
      setDrawerOpen(false);
      await list.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setFormError(message);
      if (message.includes('id')) {
        setErrors((prev) => ({ ...prev, id: message }));
      }
      setToast({ open: true, message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 删除 */
  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget || deleting) {
      return;
    }
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteContent('news', target.id);
      setToast({ open: true, message: '删除成功', type: 'success' });
      setDeleteTarget(null);
      list.afterDelete(list.rows.length - 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setToast({ open: true, message, type: 'error' });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns = useMemo<DataTableColumn<NewsItem>[]>(
    () => [
      { key: 'id', title: 'ID', width: '180px' },
      { key: 'title', title: '标题' },
      { key: 'date', title: '日期', width: '120px' },
      { key: 'category', title: '分类', width: '120px' },
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
          placeholder="搜索标题 / 摘要"
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
          + 新增新闻
        </button>
      </div>

      {list.error && (
        <div className="rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          {list.error}
        </div>
      )}

      <DataTable<NewsItem>
        columns={columns}
        rows={list.rows}
        rowKey={(row) => row.id}
        loading={list.loading}
        emptyText="暂无新闻数据"
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
        title={editing ? '编辑新闻' : '新增新闻'}
        onClose={closeDrawer}
        loading={saving}
      >
        <div className="flex flex-col gap-4">
          {formError && (
            <div className="rounded-btn border border-error/30 bg-white px-3 py-2 text-sm text-error">
              {formError}
            </div>
          )}

          <IdField
            value={form.id}
            onChange={(v) => updateField('id', v)}
            editing={editing}
            generator={() => generateContentId(ID_PREFIX.news)}
            required
            error={errors.id}
            placeholder="如 news-2026-001"
            maxLength={LIMITS.id}
            disabled={saving}
          />

          <TextField
            label="标题"
            value={form.title}
            onChange={(v) => updateField('title', v)}
            required
            error={errors.title}
            placeholder="新闻标题"
            maxLength={LIMITS.title}
            disabled={saving}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <DateField
              label="日期"
              value={form.date}
              onChange={(v) => updateField('date', v)}
              required
              error={errors.date}
              disabled={saving}
            />
            <TextField
              label="分类"
              value={form.category}
              onChange={(v) => updateField('category', v)}
              required
              error={errors.category}
              placeholder="如 公司动态"
              maxLength={LIMITS.category}
              disabled={saving}
            />
          </div>

          <ImageField
            label="封面图"
            value={form.cover}
            onChange={(v) => updateField('cover', v)}
            type="news"
            error={errors.cover}
            disabled={saving}
          />

          <TextAreaField
            label="摘要"
            value={form.summary}
            onChange={(v) => updateField('summary', v)}
            required
            error={errors.summary}
            placeholder="新闻摘要"
            maxLength={LIMITS.summary}
            rows={3}
            disabled={saving}
          />

          <TextAreaField
            label="正文"
            value={form.content}
            onChange={(v) => updateField('content', v)}
            required
            error={errors.content}
            placeholder="新闻正文"
            maxLength={LIMITS.content}
            rows={10}
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
        title="删除新闻"
        content={
          deleteTarget
            ? `确定删除新闻「${deleteTarget.title}」（${deleteTarget.id}）吗？此操作不可恢复。`
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
