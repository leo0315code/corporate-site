import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMS_ROUTES } from '@/constants';
import { TextField } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import { fetchProfile, resetPassword } from '@/services/cms';
import { clearToken, handleAuthError } from '@/utils/authToken';
import { closedToast, evaluateNewPassword, resolveAuthError, PASSWORD_REQUIREMENT } from './authForm';
import type { ToastState } from './authForm';

/** 强制改密失败兜底文案 */
const RESET_FALLBACK = '密码修改失败，请稍后重试';

/**
 * 首次强制改密页。
 *
 * - 进入时自检：`fetchProfile()`；
 *   - 失败 → `handleAuthError`（1003 已跳登录、1006 已跳本页）；
 *   - `must_change_password === false`（已改过）→ 直接进仪表盘，避免手输 URL 卡在无意义页。
 * - 前端强度提示与两次一致校验；不一致时阻止提交。
 * - 成功：提示 → 清 Token → 回登录页（后端已作废该账号全部会话）。
 */
export default function ResetPassword() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(closedToast());

  const aliveRef = useRef(true);

  // 前置条件自检
  useEffect(() => {
    aliveRef.current = true;

    void (async () => {
      try {
        const profile = await fetchProfile();
        if (!aliveRef.current) {
          return;
        }
        if (!profile.must_change_password) {
          // 已改过密码 → 无需停留本页
          navigate(CMS_ROUTES.DASHBOARD, { replace: true });
          return;
        }
        setChecking(false);
      } catch (err) {
        // 1003/1006 由 cms.ts 的 guard 调用 handleAuthError 分流；此处再兜底一次
        handleAuthError(err);
        if (aliveRef.current) {
          setChecking(false);
        }
      }
    })();

    return () => {
      aliveRef.current = false;
    };
  }, [navigate]);

  /** 提交强制改密 */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) {
      return;
    }

    // 前端即时校验（强度 + 一致性）
    const strengthError = evaluateNewPassword(newPassword);
    const mismatch = confirmPassword !== newPassword;

    setNewPasswordError(strengthError);
    setConfirmPasswordError(mismatch ? '两次输入的新密码不一致' : '');

    if (strengthError !== '' || mismatch) {
      return;
    }

    setSubmitting(true);
    try {
      await resetPassword({ newPassword, confirmPassword });
      setToast({ open: true, message: '密码修改成功，请使用新密码登录', type: 'success' });
      clearToken();
      // 提示后跳回登录页；短暂延时让 Toast 可见
      window.setTimeout(() => {
        navigate(CMS_ROUTES.LOGIN, { replace: true });
      }, 900);
    } catch (err) {
      const { message } = resolveAuthError(err, RESET_FALLBACK);
      setToast({ open: true, message, type: 'error' });
      if (aliveRef.current) {
        setSubmitting(false);
      }
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-soft p-4">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-soft p-4">
      <div className="w-full max-w-sm rounded-md border border-border bg-white p-6 sm:p-8">
        {/* 品牌头 */}
        <div className="flex flex-col items-center">
          <span className="flex h-10 w-10 items-center justify-center rounded-btn bg-primary text-sm font-bold text-white">
            CMS
          </span>
          <h1 className="mt-4 text-h3 font-semibold text-text">首次登录改密</h1>
          <p className="mt-1 text-center text-sm text-text-secondary">
            为保障账号安全，请先修改初始密码
          </p>
        </div>

        {/* 改密表单 */}
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div>
            <TextField
              label="新密码"
              type="password"
              value={newPassword}
              onChange={(v) => {
                setNewPassword(v);
                if (newPasswordError) {
                  setNewPasswordError('');
                }
                if (confirmPasswordError && v === confirmPassword) {
                  setConfirmPasswordError('');
                }
              }}
              error={newPasswordError}
              placeholder="请输入新密码"
              maxLength={72}
              disabled={submitting}
            />
            <p className="mt-1 text-xs text-text-muted">{PASSWORD_REQUIREMENT}</p>
          </div>

          <TextField
            label="确认新密码"
            type="password"
            value={confirmPassword}
            onChange={(v) => {
              setConfirmPassword(v);
              if (confirmPasswordError) {
                setConfirmPasswordError('');
              }
            }}
            error={confirmPasswordError}
            placeholder="请再次输入新密码"
            maxLength={72}
            disabled={submitting}
          />

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '提交中…' : '确认修改'}
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
