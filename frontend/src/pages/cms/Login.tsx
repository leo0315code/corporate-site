import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMS_ROUTES } from '@/constants';
import { TextField } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import { fetchProfile, login } from '@/services/cms';
import { getToken, setToken, clearToken } from '@/utils/authToken';
import { closedToast, resolveAuthError } from './authForm';
import type { ToastState } from './authForm';
import { useNoindex } from '@/hooks/useNoindex';

/** 登录失败兜底文案（后端已返回明确 message 时优先用后端文案） */
const LOGIN_FALLBACK = '登录失败，请稍后重试';

/**
 * 后台登录页。
 *
 * - 居中卡片（登录类独立页允许居中，后台内页才要求全宽）。
 * - 回车即提交；提交期间按钮置灰防重复点击。
 * - 成功：`setToken(res.token)` 后按 `must_change_password` 决定跳强制改密页或仪表盘。
 * - 已登录：进入页面时若本地有 Token，静默 `fetchProfile()` 校验；通过则直接进仪表盘，
 *   失败则清 Token 继续停留登录页（**不阻塞首屏渲染**）。
 */
export default function Login() {
  useNoindex();

  const navigate = useNavigate();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(closedToast());

  /** 防止「已登录自检」在卸载后 setState */
  const aliveRef = useRef(true);

  // 已登录自检：静默校验本地 Token，通过则直达仪表盘
  useEffect(() => {
    aliveRef.current = true;

    if (!getToken()) {
      return () => {
        aliveRef.current = false;
      };
    }

    void (async () => {
      try {
        await fetchProfile();
        if (aliveRef.current) {
          navigate(CMS_ROUTES.DASHBOARD, { replace: true });
        }
      } catch {
        // 校验失败（1003/1006 已由 guard 分流跳转；其它错误）→ 清 Token 继续显示登录页
        clearToken();
      }
    })();

    return () => {
      aliveRef.current = false;
    };
  }, [navigate]);

  /** 前端即时校验：两字段均非空（不做密码强度校验，交由后端裁决） */
  const validate = (): boolean => {
    let ok = true;

    if (username.trim() === '') {
      setUsernameError('请输入账号');
      ok = false;
    } else {
      setUsernameError('');
    }

    if (password === '') {
      setPasswordError('请输入密码');
      ok = false;
    } else {
      setPasswordError('');
    }

    return ok;
  };

  /** 提交登录 */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) {
      return;
    }
    if (!validate()) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await login({ username: username.trim(), password });
      // 登录接口刻意不自动落 Token，此处显式保存
      setToken(res.token);

      if (res.must_change_password) {
        navigate(CMS_ROUTES.RESET_PASSWORD, { replace: true });
      } else {
        navigate(CMS_ROUTES.DASHBOARD, { replace: true });
      }
    } catch (err) {
      const { message } = resolveAuthError(err, LOGIN_FALLBACK);
      setToast({ open: true, message, type: 'error' });
    } finally {
      if (aliveRef.current) {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-soft p-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-white p-6 sm:p-8">
        {/* 品牌头 */}
        <div className="flex flex-col items-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary text-sm font-bold text-white">
            CMS
          </span>
          <h1 className="mt-4 text-h3 font-semibold text-text">内容管理后台</h1>
          <p className="mt-1 text-sm text-text-secondary">请登录以继续</p>
        </div>

        {/* 登录表单 */}
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <TextField
            label="账号"
            value={username}
            onChange={(v) => {
              setUsername(v);
              if (usernameError) {
                setUsernameError('');
              }
            }}
            error={usernameError}
            placeholder="请输入账号"
            maxLength={50}
            disabled={submitting}
          />

          <TextField
            label="密码"
            type="password"
            value={password}
            onChange={(v) => {
              setPassword(v);
              if (passwordError) {
                setPasswordError('');
              }
            }}
            error={passwordError}
            placeholder="请输入密码"
            maxLength={72}
            disabled={submitting}
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '登录中…' : '登录'}
          </button>
        </form>
      </div>

      <Toast
        open={toast.open}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
