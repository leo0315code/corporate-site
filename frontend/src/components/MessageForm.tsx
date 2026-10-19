import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, submitMessage } from '@/services/api';
import { APP, MESSAGES } from '@/constants';
import type { MessagePayload } from '@/types';
import { isMessageValid, validateMessage } from '@/utils/validate';
import type { MessageFormErrors } from '@/utils/validate';
import Toast from '@/components/common/Toast';
import Button from '@/components/common/Button';

/** 表单初始值 */
const INITIAL_FORM: MessagePayload = {
  name: '',
  company: '',
  phone: '',
  email: '',
  content: '',
};

/** Toast 状态 */
interface ToastState {
  open: boolean;
  message: string;
  type: 'success' | 'error';
}

/**
 * 留言表单组件：
 * - 字段：name（必填）/ company（选填）/ phone / email（二选一必填）/ content（必填）
 * - 前端校验（与后端一致），错误显示在字段下方红字
 * - 提交中按钮置灰 + 「提交中…」，防重复点击
 * - 成功后 Toast + 清空表单 + 30s 冷却
 * - 失败保留内容并展示后端返回的 message
 * - 底部隐私提示
 */
export default function MessageForm() {
  const [form, setForm] = useState<MessagePayload>(INITIAL_FORM);
  const [errors, setErrors] = useState<MessageFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>({
    open: false,
    message: '',
    type: 'success',
  });
  // 冷却剩余秒数（>0 表示处于冷却期）
  const [cooldown, setCooldown] = useState(0);
  const cooldownTimer = useRef<number | null>(null);

  // 冷却倒计时
  useEffect(() => {
    if (cooldown <= 0) {
      return undefined;
    }
    cooldownTimer.current = window.setTimeout(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => {
      if (cooldownTimer.current) {
        window.clearTimeout(cooldownTimer.current);
      }
    };
  }, [cooldown]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ open: true, message, type });
  }, []);

  const closeToast = useCallback(() => {
    setToast((prev) => ({ ...prev, open: false }));
  }, []);

  /** 通用字段变更处理：更新值并清除该字段错误 */
  const handleChange = (
    field: keyof MessagePayload,
    value: string,
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const handleSubmit = async () => {
    // 冷却期内不可再次提交
    if (submitting || cooldown > 0) {
      return;
    }

    // 前端校验
    const validationErrors = validateMessage(form);
    if (!isMessageValid(validationErrors)) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      await submitMessage(form);
      showToast(MESSAGES.SUBMIT_SUCCESS, 'success');
      // 清空表单 + 进入冷却
      setForm(INITIAL_FORM);
      setErrors({});
      setCooldown(APP.COOLDOWN_SECONDS);
    } catch (error) {
      // 业务错误：展示后端 message；网络异常：展示网络提示
      if (error instanceof ApiError) {
        showToast(error.message || MESSAGES.SUBMIT_FAIL, 'error');
      } else {
        showToast(MESSAGES.SUBMIT_FAIL, 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const submitDisabled = submitting || cooldown > 0;
  const submitText = submitting
    ? MESSAGES.SUBMITTING
    : cooldown > 0
      ? `${cooldown}s 后可再次提交`
      : '提交留言';

  return (
    <div className="rounded-lg border border-border bg-white p-6 shadow-md md:p-8">
      <h3 className="text-h3 font-bold text-secondary">在线留言</h3>
      <p className="mt-2 text-sm text-text-secondary">
        填写下方信息，我们会尽快与您联系。
      </p>

      <form
        className="mt-6 space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        {/* 姓名 + 公司（两列） */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="mf-name" className="mb-2 block text-sm font-medium text-text">
              姓名 <span className="text-error">*</span>
            </label>
            <input
              id="mf-name"
              name="name"
              type="text"
              className={`form-input ${errors.name ? 'form-input-error' : ''}`}
              placeholder="请输入您的姓名"
              value={form.name}
              maxLength={30}
              onChange={(event) => handleChange('name', event.target.value)}
            />
            {errors.name ? (
              <p className="mt-1.5 text-xs text-error">{errors.name}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="mf-company" className="mb-2 block text-sm font-medium text-text">
              公司
            </label>
            <input
              id="mf-company"
              name="company"
              type="text"
              className={`form-input ${errors.company ? 'form-input-error' : ''}`}
              placeholder="请输入公司名称（选填）"
              value={form.company}
              maxLength={50}
              onChange={(event) => handleChange('company', event.target.value)}
            />
            {errors.company ? (
              <p className="mt-1.5 text-xs text-error">{errors.company}</p>
            ) : null}
          </div>
        </div>

        {/* 电话 + 邮箱（两列） */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div>
            <label htmlFor="mf-phone" className="mb-2 block text-sm font-medium text-text">
              电话
            </label>
            <input
              id="mf-phone"
              name="phone"
              type="tel"
              className={`form-input ${errors.phone ? 'form-input-error' : ''}`}
              placeholder="手机号或座机"
              value={form.phone}
              maxLength={20}
              onChange={(event) => handleChange('phone', event.target.value)}
            />
            {errors.phone ? (
              <p className="mt-1.5 text-xs text-error">{errors.phone}</p>
            ) : null}
          </div>

          <div>
            <label htmlFor="mf-email" className="mb-2 block text-sm font-medium text-text">
              邮箱
            </label>
            <input
              id="mf-email"
              name="email"
              type="email"
              className={`form-input ${errors.email ? 'form-input-error' : ''}`}
              placeholder="name@example.com"
              value={form.email}
              maxLength={100}
              onChange={(event) => handleChange('email', event.target.value)}
            />
            {errors.email ? (
              <p className="mt-1.5 text-xs text-error">{errors.email}</p>
            ) : null}
          </div>
        </div>
        <p className="-mt-2 text-xs text-text-muted">电话与邮箱至少填写一项</p>

        {/* 留言内容 */}
        <div>
          <label htmlFor="mf-content" className="mb-2 block text-sm font-medium text-text">
            留言内容 <span className="text-error">*</span>
          </label>
          <textarea
            id="mf-content"
            name="content"
            rows={5}
            className={`form-input resize-none ${errors.content ? 'form-input-error' : ''}`}
            placeholder="请简要描述您的需求（5~500 字）"
            value={form.content}
            maxLength={500}
            onChange={(event) => handleChange('content', event.target.value)}
          />
          <div className="mt-1.5 flex items-center justify-between">
            {errors.content ? (
              <p className="text-xs text-error">{errors.content}</p>
            ) : (
              <span />
            )}
            <span className="text-xs text-text-muted">{form.content.length}/500</span>
          </div>
        </div>

        {/* 提交按钮 */}
        <Button
          variant="primary"
          size="lg"
          disabled={submitDisabled}
          className="w-full"
          buttonProps={{ type: 'submit' }}
        >
          {submitting ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              {submitText}
            </span>
          ) : (
            submitText
          )}
        </Button>

        {/* 隐私提示 */}
        <p className="text-center text-xs text-text-muted">{MESSAGES.FORM_PRIVACY}</p>
      </form>

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={closeToast}
      />
    </div>
  );
}
