import { useEffect, useMemo, useState } from 'react';
import { MESSAGES } from '@/constants';
import { ObjectListField, TextAreaField, TextField } from '@/components/cms/FormFields';
import ImageField from '@/components/cms/ImageField';
import Toast from '@/components/common/Toast';
import { fetchSiteDetail, saveSiteDetail } from '@/services/cms';
import type { SiteConfigData, SocialLink } from '@/types';

/**
 * 网站配置管理页（**单例**整页编辑）。
 *
 * 覆盖范围（按确认的边界）：**公司信息 + 联系方式/页脚 + SEO**。
 *
 * 刻意**不提供**的配置项：
 * - **导航菜单（nav）**：配错路径会直接导致前台 404，且与页脚快速链接同源，故保持静态；
 * - **主题色（theme）**：受构建期 Tailwind 编译约束，运行时改色需整体改为 CSS 变量注入，
 *   本次不做（属独立课题）；
 * - **页脚快速链接（footer.quickLinks）**：与 nav 同源，同样保持静态。
 *
 * 保存成功后调用方（`saveSiteDetail`）会清内容缓存，前台刷新即生效。
 */

/** 社交链接行类型（`ObjectListField` 要求 `Record<string, string>`） */
type SocialFormItem = SocialLink & Record<string, string>;

/** 本页表单状态 */
interface SiteForm {
  companyName: string;
  logo: string;
  slogan: string;
  description: string;
  phone: string;
  email: string;
  address: string;
  workTime: string;
  mapImage: string;
  copyright: string;
  icp: string;
  socials: SocialFormItem[];
  seoTitle: string;
  seoDesc: string;
  seoKeywords: string;
}

/** 空结构（读取失败 / 空库时的兜底） */
function emptyForm(): SiteForm {
  return {
    companyName: '',
    logo: '',
    slogan: '',
    description: '',
    phone: '',
    email: '',
    address: '',
    workTime: '',
    mapImage: '',
    copyright: '',
    icp: '',
    socials: [],
    seoTitle: '',
    seoDesc: '',
    seoKeywords: '',
  };
}

/** 由 SiteConfigData（嵌套）构造表单状态（扁平） */
function toForm(data: SiteConfigData): SiteForm {
  return {
    companyName: data.companyName ?? '',
    logo: data.logo ?? '',
    slogan: data.slogan ?? '',
    description: data.description ?? '',
    phone: data.contact?.phone ?? '',
    email: data.contact?.email ?? '',
    address: data.contact?.address ?? '',
    workTime: data.contact?.workTime ?? '',
    mapImage: data.contact?.mapImage ?? '',
    copyright: data.footer?.copyright ?? '',
    icp: data.footer?.icp ?? '',
    socials: Array.isArray(data.footer?.socials) ? (data.footer.socials as SocialFormItem[]) : [],
    seoTitle: data.seo?.title ?? '',
    seoDesc: data.seo?.description ?? '',
    seoKeywords: data.seo?.keywords ?? '',
  };
}

/** 由表单状态构造提交载荷（嵌套，对齐后端契约） */
function toPayload(form: SiteForm): SiteConfigData {
  return {
    companyName: form.companyName.trim(),
    logo: form.logo.trim(),
    slogan: form.slogan.trim(),
    description: form.description.trim(),
    contact: {
      phone: form.phone.trim(),
      email: form.email.trim(),
      address: form.address.trim(),
      workTime: form.workTime.trim(),
      mapImage: form.mapImage.trim(),
    },
    footer: {
      copyright: form.copyright.trim(),
      icp: form.icp.trim(),
      socials: form.socials
        .map((item) => ({
          label: (item.label ?? '').trim(),
          url: (item.url ?? '').trim(),
          icon: (item.icon ?? '').trim(),
        }))
        // label 为空的行后端会丢弃，前端先过滤以免用户困惑
        .filter((item) => item.label !== ''),
    },
    seo: {
      title: form.seoTitle.trim(),
      description: form.seoDesc.trim(),
      keywords: form.seoKeywords.trim(),
    },
  };
}

/** 长度上限（与后端 ContentValidate scene=site / ContentService 归一化对齐） */
const LIMITS = {
  companyName: 50,
  slogan: 100,
  description: 500,
  phone: 50,
  email: 100,
  address: 200,
  workTime: 100,
  copyright: 200,
  icp: 100,
  socialLabel: 30,
  socialUrl: 500,
  seoTitle: 200,
  seoDesc: 500,
  seoKeywords: 500,
} as const;

/** 社交链接列定义（{label,url,icon}） */
const SOCIAL_FIELDS = [
  {
    key: 'label',
    label: '名称',
    type: 'text' as const,
    placeholder: `如 微信公众号（≤${LIMITS.socialLabel} 字符）`,
    required: true,
  },
  {
    key: 'url',
    label: '链接',
    type: 'text' as const,
    placeholder: '如 https://weixin.qq.com/（≤500 字符）',
  },
  {
    key: 'icon',
    label: '图标标识',
    type: 'text' as const,
    placeholder: '如 wechat / weibo / linkedin',
  },
];

/** 字段级错误键 */
type FormErrors = Partial<Record<'companyName' | 'socials', string>>;

/**
 * 网站配置管理页组件
 */
export default function SiteConfigManage() {
  const [form, setForm] = useState<SiteForm>(() => emptyForm());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState('');

  const [toast, setToast] = useState<{ open: boolean; message: string; type: 'success' | 'error' }>({
    open: false,
    message: '',
    type: 'success',
  });

  /** 读取整页数据并回填（保存成功后亦复用，验证往返一致） */
  const load = async (): Promise<void> => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await fetchSiteDetail();
      setForm(toForm(data));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // 仅在挂载时读取一次；load 为稳定逻辑（无需列为依赖）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 更新标量字段并清除其错误 */
  const setField = <K extends keyof SiteForm>(key: K, value: SiteForm[K]): void => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === 'companyName') {
      setErrors((prev) => {
        if (!prev.companyName) {
          return prev;
        }
        const next = { ...prev };
        delete next.companyName;
        return next;
      });
    }
  };

  /** 前端即时校验（最终以后端 code/message 为准） */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (form.companyName.trim() === '') {
      next.companyName = '请填写公司名称';
    } else if (form.companyName.length > LIMITS.companyName) {
      next.companyName = `公司名称不得超过 ${LIMITS.companyName} 个字符`;
    }

    // 名称与链接需成对出现：有 url 无 label 的行会被后端丢弃，提前提示
    const missingLabel = form.socials.some(
      (item) => (item.url ?? '').trim() !== '' && (item.label ?? '').trim() === '',
    );
    if (missingLabel) {
      next.socials = '社交链接填写了地址时必须同时填写名称';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** 保存整页 */
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
      const saved = await saveSiteDetail(toPayload(form));
      // 用服务端返回值回填，确认往返一致
      setForm(toForm(saved));
      setToast({ open: true, message: '保存成功', type: 'success' });
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setFormError(message);
      setToast({ open: true, message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  /** 社交链接更新 */
  const setSocials = (value: SocialFormItem[]): void => setForm((prev) => ({ ...prev, socials: value }));

  /** 顶部信息条摘要 */
  const summary = useMemo(
    () => ({
      socials: form.socials.length,
      hasLogo: form.logo !== '',
    }),
    [form.socials.length, form.logo],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部说明 + 保存按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">网站配置（全站单例）</h2>
          <p className="mt-1 text-xs text-text-secondary">
            公司信息 / 联系方式 / 页脚 / SEO · 社交链接 {summary.socials} 项 · Logo{' '}
            {summary.hasLogo ? '已设置' : '未设置'}
          </p>
          <p className="mt-1 text-xs text-text-muted">
            导航菜单与主题色不在本页范围（分别由前端静态配置与构建期决定）
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving || loading}
          className="rounded-btn bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </div>

      {/* 加载 / 读取错误 */}
      {loading && (
        <div className="rounded-md border border-border bg-white px-4 py-3 text-sm text-text-secondary">
          加载中…
        </div>
      )}
      {!loading && loadError && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-error/30 bg-white px-4 py-3 text-sm text-error">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-btn border border-border px-3 py-1 text-xs text-text-secondary transition-colors hover:border-primary hover:text-primary"
          >
            重新加载
          </button>
        </div>
      )}

      {/* 表单区（加载完成后可用） */}
      {!loading && !loadError && (
        <div className="flex flex-col gap-6">
          {formError && (
            <div className="rounded-btn border border-error/30 bg-white px-3 py-2 text-sm text-error">
              {formError}
            </div>
          )}

          {/* —— 1. 公司信息 —— */}
          <section className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:p-6">
            <h3 className="text-sm font-semibold text-text">公司信息</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="公司名称"
                value={form.companyName}
                onChange={(v) => setField('companyName', v)}
                required
                error={errors.companyName}
                placeholder="如 示例科技"
                maxLength={LIMITS.companyName}
                disabled={saving}
              />
              <TextField
                label="标语"
                value={form.slogan}
                onChange={(v) => setField('slogan', v)}
                placeholder="如 专业的企业数字化解决方案"
                maxLength={LIMITS.slogan}
                disabled={saving}
              />
            </div>

            <TextAreaField
              label="公司简介"
              value={form.description}
              onChange={(v) => setField('description', v)}
              placeholder="用于页脚与搜索引擎描述"
              maxLength={LIMITS.description}
              rows={4}
              disabled={saving}
            />

            <ImageField
              label="Logo"
              value={form.logo}
              onChange={(v) => setField('logo', v)}
              type="common"
              alt={form.companyName || '公司 Logo'}
              disabled={saving}
            />
          </section>

          {/* —— 2. 联系方式 —— */}
          <section className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:p-6">
            <h3 className="text-sm font-semibold text-text">联系方式</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="联系电话"
                value={form.phone}
                onChange={(v) => setField('phone', v)}
                placeholder="如 400-000-0000"
                maxLength={LIMITS.phone}
                disabled={saving}
              />
              <TextField
                label="联系邮箱"
                value={form.email}
                onChange={(v) => setField('email', v)}
                placeholder="如 contact@example.com"
                maxLength={LIMITS.email}
                disabled={saving}
              />
            </div>

            <TextField
              label="联系地址"
              value={form.address}
              onChange={(v) => setField('address', v)}
              placeholder="如 北京市朝阳区示例大厦 A 座 18 层"
              maxLength={LIMITS.address}
              disabled={saving}
            />

            <TextField
              label="工作时间"
              value={form.workTime}
              onChange={(v) => setField('workTime', v)}
              placeholder="如 周一至周五 9:00 - 18:00"
              maxLength={LIMITS.workTime}
              disabled={saving}
            />

            <ImageField
              label="地图占位图"
              value={form.mapImage}
              onChange={(v) => setField('mapImage', v)}
              type="common"
              alt="地图占位图"
              disabled={saving}
            />
          </section>

          {/* —— 3. 页脚 —— */}
          <section className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:p-6">
            <h3 className="text-sm font-semibold text-text">页脚</h3>

            <div className="grid gap-4 md:grid-cols-2">
              <TextField
                label="版权文案"
                value={form.copyright}
                onChange={(v) => setField('copyright', v)}
                placeholder={`如 © ${new Date().getFullYear()} 示例科技 保留所有权利`}
                maxLength={LIMITS.copyright}
                disabled={saving}
              />
              <TextField
                label="备案号"
                value={form.icp}
                onChange={(v) => setField('icp', v)}
                placeholder="如 京ICP备00000000号"
                maxLength={LIMITS.icp}
                disabled={saving}
              />
            </div>

            <ObjectListField<SocialFormItem>
              label="社交链接（socials）"
              value={form.socials}
              onChange={setSocials}
              fields={SOCIAL_FIELDS}
              addText="+ 新增社交链接"
              emptyText="暂无社交链接，点击下方新增"
              disabled={saving}
            />
            {errors.socials && <span className="text-xs text-error">{errors.socials}</span>}

            <p className="text-xs text-text-muted">
              页脚「快速链接」与导航菜单同源，由前端静态配置提供，不在本页维护。
            </p>
          </section>

          {/* —— 4. SEO —— */}
          <section className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:p-6">
            <h3 className="text-sm font-semibold text-text">SEO</h3>

            <TextField
              label="SEO 标题"
              value={form.seoTitle}
              onChange={(v) => setField('seoTitle', v)}
              placeholder="如 示例科技 | 专业的企业数字化解决方案"
              maxLength={LIMITS.seoTitle}
              disabled={saving}
            />

            <TextAreaField
              label="SEO 描述"
              value={form.seoDesc}
              onChange={(v) => setField('seoDesc', v)}
              placeholder="搜索引擎结果摘要（建议 ≤160 字符）"
              maxLength={LIMITS.seoDesc}
              rows={3}
              disabled={saving}
            />

            <TextAreaField
              label="SEO 关键词"
              value={form.seoKeywords}
              onChange={(v) => setField('seoKeywords', v)}
              placeholder="英文逗号分隔，如 企业官网,数字化解决方案"
              maxLength={LIMITS.seoKeywords}
              rows={2}
              disabled={saving}
            />

            <p className="text-xs text-text-muted">
              首页标题使用「SEO 标题」；其余页面为「页面标题 | 公司名称」。
            </p>
          </section>

          <div className="flex justify-end gap-3 rounded-md border border-border bg-white p-4">
            <button
              type="button"
              onClick={() => void load()}
              disabled={saving}
              className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              重置
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
      )}

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
