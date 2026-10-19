import { useEffect, useMemo, useState } from 'react';
import { MESSAGES } from '@/constants';
import {
  ObjectListField,
  TagListField,
  TextAreaField,
  TextField,
} from '@/components/cms/FormFields';
import type { ObjectListFieldDef } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import { fetchAboutDetail, saveAbout } from '@/services/cms';
import type { Ability, AboutData, TimelineItem } from '@/types';

/** 空结构（读取失败 / 空库时的兜底） */
function emptyAbout(): AboutData {
  return {
    intro: '',
    vision: '',
    mission: '',
    values: [],
    timeline: [],
    abilities: [],
  };
}

/**
 * 结构化列表的表单行类型。
 *
 * 背景：`ObjectListField<T>` 约束 `T extends Record<string, string>`（便于按键索引更新），
 * 而 `TimelineItem` / `Ability` 为无索引签名的接口。此处以「交叉 Record<string,string>」
 * 让行类型同时满足字段访问与索引约束，避免改动通用组件 `FormFields.tsx`。
 */
type TimelineFormItem = TimelineItem & Record<string, string>;
type AbilityFormItem = Ability & Record<string, string>;

/** 本页表单状态（结构化行使用带索引签名的表单行类型） */
interface AboutForm {
  intro: string;
  vision: string;
  mission: string;
  values: string[];
  timeline: TimelineFormItem[];
  abilities: AbilityFormItem[];
}

/** 由 AboutData 构造表单状态 */
function toForm(data: AboutData): AboutForm {
  return {
    intro: data.intro ?? '',
    vision: data.vision ?? '',
    mission: data.mission ?? '',
    values: Array.isArray(data.values) ? data.values : [],
    timeline: Array.isArray(data.timeline) ? (data.timeline as TimelineFormItem[]) : [],
    abilities: Array.isArray(data.abilities) ? (data.abilities as AbilityFormItem[]) : [],
  };
}

/** 表单动作错误键（仅用于字段级错误定位） */
type FormErrors = Partial<Record<'intro' | 'vision' | 'mission', string>>;

/** 长度上限（与后端 ContentValidate scene=about / ContentService 归一化对齐） */
const LIMITS = {
  intro: 20000,
  vision: 200,
  mission: 200,
  valueItem: 30,
  timelineYear: 10,
  timelineTitle: 50,
  timelineDesc: 200,
  abilityTitle: 50,
  abilityDesc: 200,
} as const;

/** 发展历程列定义（{year,title,desc}） */
const TIMELINE_FIELDS: ObjectListFieldDef[] = [
  {
    key: 'year',
    label: '年份',
    type: 'text',
    placeholder: `如 2016（≤${LIMITS.timelineYear} 字符）`,
    required: true,
  },
  {
    key: 'title',
    label: '标题',
    type: 'text',
    placeholder: `如 公司成立（≤${LIMITS.timelineTitle} 字符）`,
  },
  {
    key: 'desc',
    label: '描述',
    type: 'textarea',
    placeholder: `历程描述（≤${LIMITS.timelineDesc} 字符）`,
  },
];

/** 能力资质列定义（{title,desc}） */
const ABILITY_FIELDS: ObjectListFieldDef[] = [
  {
    key: 'title',
    label: '能力名称',
    type: 'text',
    placeholder: `如 ISO 9001（≤${LIMITS.abilityTitle} 字符）`,
    required: true,
  },
  {
    key: 'desc',
    label: '描述',
    type: 'textarea',
    placeholder: `能力说明（≤${LIMITS.abilityDesc} 字符）`,
  },
];

/**
 * 关于我们管理页（**单例**整页编辑）。
 *
 * - **无列表 / 无新增 / 无删除**：页面进入即读取 `GET content/about/detail` 回填表单。
 * - 结构化字段：
 *   - `values`（价值观）→ `TagListField`（增 / 删 / 改）；
 *   - `timeline`（{year,title,desc}[]）→ `ObjectListField`；
 *   - `abilities`（{title,desc}[]）→ `ObjectListField`。
 * - 保存：`POST content/about/save`（**不带 id**，后端固定 upsert id=1）；成功后 Toast
 *   并**重新拉取**服务端数据回填，验证 JSON 字段往返一致。
 * - 校验：前端即时（intro/vision/mission 必填 + 长度），最终以后端 `code/message` 为准。
 */
export default function AboutManage() {
  const [form, setForm] = useState<AboutForm>(() => toForm(emptyAbout()));
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
      const data = await fetchAboutDetail();
      setForm(toForm(data));
    } catch (err) {
      const message = err instanceof Error ? err.message : MESSAGES.NETWORK_ERROR;
      setLoadError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // 仅在挂载时读取一次；load 为稳定逻辑（无需列为依赖）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 更新文本字段并清除其错误 */
  const updateTextField = (key: 'intro' | 'vision' | 'mission', value: string): void => {
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

  /** 前端即时校验 */
  const validate = (): boolean => {
    const next: FormErrors = {};

    if (form.intro.trim() === '') {
      next.intro = '请填写公司简介';
    } else if (form.intro.length > LIMITS.intro) {
      next.intro = '公司简介长度超出上限';
    }

    if (form.vision.trim() === '') {
      next.vision = '请填写愿景';
    } else if (form.vision.length > LIMITS.vision) {
      next.vision = `愿景不得超过 ${LIMITS.vision} 个字符`;
    }

    if (form.mission.trim() === '') {
      next.mission = '请填写使命';
    } else if (form.mission.length > LIMITS.mission) {
      next.mission = `使命不得超过 ${LIMITS.mission} 个字符`;
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /** 归一化提交载荷（对齐后端：去空白、丢弃空项、剔除不完整结构项） */
  const buildPayload = (): AboutData => ({
    intro: form.intro.trim(),
    vision: form.vision.trim(),
    mission: form.mission.trim(),
    values: form.values.map((v) => v.trim()).filter((v) => v !== ''),
    timeline: form.timeline
      .map((item) => ({
        year: item.year.trim(),
        title: item.title.trim(),
        desc: item.desc.trim(),
      }))
      .filter((item) => item.year !== ''),
    abilities: form.abilities
      .map((item) => ({
        title: item.title.trim(),
        desc: item.desc.trim(),
      }))
      .filter((item) => item.title !== ''),
  });

  /** 保存整页（不带 id） */
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
      const payload = buildPayload();
      const saved = await saveAbout(payload);
      // 用服务端返回值回填，确认 JSON 字段往返一致
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

  /** 结构化字段更新 */
  const setValues = (value: string[]): void => setForm((prev) => ({ ...prev, values: value }));
  const setTimeline = (value: TimelineFormItem[]): void =>
    setForm((prev) => ({ ...prev, timeline: value }));
  const setAbilities = (value: AbilityFormItem[]): void =>
    setForm((prev) => ({ ...prev, abilities: value }));

  /** 结构化字段摘要（仅供顶部信息条展示） */
  const summary = useMemo(
    () => ({
      values: form.values.length,
      timeline: form.timeline.length,
      abilities: form.abilities.length,
    }),
    [form.values.length, form.timeline.length, form.abilities.length],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部说明 + 保存按钮 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">关于我们（单页内容）</h2>
          <p className="mt-1 text-xs text-text-secondary">
            整页保存：价值观 {summary.values} 项 · 发展历程 {summary.timeline} 条 · 能力资质{' '}
            {summary.abilities} 项
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
        <div className="flex flex-col gap-4 rounded-md border border-border bg-white p-4 md:p-6">
          {formError && (
            <div className="rounded-btn border border-error/30 bg-white px-3 py-2 text-sm text-error">
              {formError}
            </div>
          )}

          <TextAreaField
            label="公司简介"
            value={form.intro}
            onChange={(v) => updateTextField('intro', v)}
            required
            error={errors.intro}
            placeholder="公司简介正文"
            maxLength={LIMITS.intro}
            rows={8}
            disabled={saving}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="愿景"
              value={form.vision}
              onChange={(v) => updateTextField('vision', v)}
              required
              error={errors.vision}
              placeholder="公司愿景"
              maxLength={LIMITS.vision}
              disabled={saving}
            />
            <TextField
              label="使命"
              value={form.mission}
              onChange={(v) => updateTextField('mission', v)}
              required
              error={errors.mission}
              placeholder="公司使命"
              maxLength={LIMITS.mission}
              disabled={saving}
            />
          </div>

          <TagListField
            label="价值观（values）"
            value={form.values}
            onChange={setValues}
            placeholder="如 客户第一"
            itemMaxLength={LIMITS.valueItem}
            disabled={saving}
          />

          <ObjectListField<TimelineFormItem>
            label="发展历程（timeline）"
            value={form.timeline}
            onChange={setTimeline}
            fields={TIMELINE_FIELDS}
            addText="+ 新增历程"
            emptyText="暂无发展历程，点击下方新增"
            disabled={saving}
          />

          <ObjectListField<AbilityFormItem>
            label="能力资质（abilities）"
            value={form.abilities}
            onChange={setAbilities}
            fields={ABILITY_FIELDS}
            addText="+ 新增资质"
            emptyText="暂无能力资质，点击下方新增"
            disabled={saving}
          />

          <div className="flex justify-end gap-3 border-t border-border pt-4">
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
