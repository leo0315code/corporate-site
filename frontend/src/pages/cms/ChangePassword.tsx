import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CMS_ROUTES, ERROR_CODES } from '@/constants';
import { TextField } from '@/components/cms/FormFields';
import Toast from '@/components/common/Toast';
import { changePassword, fetchProfile } from '@/services/cms';
import { clearToken, getToken, handleAuthError } from '@/utils/authToken';
import { closedToast, evaluateNewPassword, resolveAuthError, PASSWORD_REQUIREMENT } from './authForm';
import type { ToastState } from './authForm';

/** 改密失败兜底文案 */
const CHANGE_FALLBACK = '密码修改失败，请稍后重试';

/**
 * 常规修改密码页。
 *
 * 路由 `/manage-x7k2/password` 挂在 `CMS.PATH` 的 children 下，**位于后台外壳
 * （侧栏 + 顶栏）之内** —— 运营是登录后才改密，与其它管理页保持一致，可随时经侧栏
 * 返回其它模块（入口见侧栏「修改密码」与顶栏按钮）。
 *
 * - 进入时自检：无 Token → 跳登录；有 Token → `fetchProfile()` 取账号名用于强度校验。
 * - 原密码 / 新密码 / 确认新密码；两次不一致阻止提交；强度即时提示。
 * - 成功：提示后 `clearToken()` → 回登录页（后端已作废该管理员全部会话，必须重新登录）。
 * - `1007`（原密码错误）定位到原密码字段展示 error。
 */
export default function ChangePassword() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [oldPasswordError, setOldPasswordError] = useState('');
  const [newPasswordError, setNewPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<ToastState>(closedToast());

  const aliveRef = useRef(true);

  // 前置条件自检：无 Token → 登录；有 Token → 取资料（含账号名）
  useEffect(() => {
    aliveRef.current = true;

    if (!getToken()) {
      navigate(CMS_ROUTES.LOGIN, { replace: true });
      return () => {
        aliveRef.current = false;
      };
    }

    void (async () => {
      try {
        const profile = await fetchProfile();
        if (aliveRef.current) {
          setUsername(profile.username);
          setChecking(false);
        }
      } catch (err) {
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

  /** 提交常规改密 */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (submitting) {
      return;
    }

    // 前端即时校验
    const oldError = oldPassword === '' ? '请输入原密码' : '';
    const strengthError = evaluateNewPassword(newPassword, username);
    const mismatch = confirmPassword !== newPassword;

    setOldPasswordError(oldError);
    setNewPasswordError(strengthError);
    setConfirmPasswordError(mismatch ? '两次输入的新密码不一致' : '');

    if (oldError !== '' || strengthError !== '' || mismatch) {
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({ oldPassword, newPassword, confirmPassword });
      setToast({ open: true, message: '密码修改成功，请使用新密码重新登录', type: 'success' });
      clearToken();
      window.setTimeout(() => {
        navigate(CMS_ROUTES.LOGIN, { replace: true });
      }, 900);
    } catch (err) {
      const { code, message } = resolveAuthError(err, CHANGE_FALLBACK);
      if (code === ERROR_CODES.OLD_PWD_WRONG) {
        // 定位到原密码字段
        setOldPasswordError(message);
      } else {
        setToast({ open: true, message, type: 'error' });
      }
      if (aliveRef.current) {
        setSubmitting(false);
      }
    }
  };

  if (checking) {
    return (
      <div className="rounded-md border border-border bg-white px-4 py-3 text-sm text-text-secondary">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 顶部说明 */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">修改密码</h2>
          <p className="mt-1 text-xs text-text-secondary">
            修改成功后需使用新密码重新登录（当前账号的全部会话将失效）
          </p>
        </div>
      </div>

      {/* 表单卡片 */}
      <div className="rounded-md border border-border bg-white p-4 sm:p-6">
        <form
          className="flex max-w-md flex-col gap-4"
          onSubmit={(e) => void handleSubmit(e)}
          noValidate
        >
          <TextField
            label="原密码"
            type="password"
            value={oldPassword}
            onChange={(v) => {
              setOldPassword(v);
              if (oldPasswordError) {
                setOldPasswordError('');
              }
            }}
            error={oldPasswordError}
            placeholder="请输入原密码"
            maxLength={72}
            disabled={submitting}
          />

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
            className="mt-2 self-start rounded-btn bg-primary px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
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
