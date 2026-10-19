import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { CMS, CMS_ROUTES, ROUTES } from '@/constants';
import { getToken } from '@/utils/authToken';

export interface CmsProtectedRouteProps {
  /** 受保护的子内容 */
  children: ReactNode;
}

/**
 * 后台受保护路由守卫。
 *
 * - `CMS.PATH === ''`（后台未启用）→ 跳前台首页 `ROUTES.HOME`；
 * - 无 Token → 跳登录页 `CMS_ROUTES.LOGIN`（replace，避免回退回到受保护页）；
 * - 有 Token → 渲染 `children`。
 *
 * 说明：此处**不**预检 profile（避免额外往返）；1003/1006 由页面 / 布局按需处理。
 */
export default function CmsProtectedRoute({ children }: CmsProtectedRouteProps) {
  if (CMS.PATH === '') {
    return <Navigate to={ROUTES.HOME} replace />;
  }

  if (!getToken()) {
    return <Navigate to={CMS_ROUTES.LOGIN} replace />;
  }

  return <>{children}</>;
}
