import { createBrowserRouter } from 'react-router-dom';
import type { RouteObject } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import MainLayout from '@/layouts/MainLayout';
import CmsLayout from '@/layouts/CmsLayout';
import CmsProtectedRoute from '@/components/cms/CmsProtectedRoute';
import { CMS, CMS_ROUTES, ROUTES } from '@/constants';

/* 前台页面懒加载：按需分包，加速首屏 */
const Home = lazy(() => import('@/pages/Home'));
const About = lazy(() => import('@/pages/About'));
const Products = lazy(() => import('@/pages/Products'));
const ProductDetail = lazy(() => import('@/pages/ProductDetail'));
const News = lazy(() => import('@/pages/News'));
const NewsDetail = lazy(() => import('@/pages/NewsDetail'));
const Contact = lazy(() => import('@/pages/Contact'));
const NotFound = lazy(() => import('@/pages/NotFound'));

/* 后台页面懒加载（与前台分开分包） */
const CmsLogin = lazy(() => import('@/pages/cms/Login'));
const CmsResetPassword = lazy(() => import('@/pages/cms/ResetPassword'));
const CmsChangePassword = lazy(() => import('@/pages/cms/ChangePassword'));
const CmsDashboard = lazy(() => import('@/pages/cms/Dashboard'));
const CmsProductsManage = lazy(() => import('@/pages/cms/ProductsManage'));
const CmsNewsManage = lazy(() => import('@/pages/cms/NewsManage'));
const CmsCasesManage = lazy(() => import('@/pages/cms/CasesManage'));
const CmsAdvantagesManage = lazy(() => import('@/pages/cms/AdvantagesManage'));
const CmsAboutManage = lazy(() => import('@/pages/cms/AboutManage'));
const CmsSiteConfigManage = lazy(() => import('@/pages/cms/SiteConfigManage'));
const CmsMessagesManage = lazy(() => import('@/pages/cms/MessagesManage'));
const CmsAccountsManage = lazy(() => import('@/pages/cms/AccountsManage'));
const CmsLogsManage = lazy(() => import('@/pages/cms/LogsManage'));

/** 懒加载 Suspense 兜底：简洁的加载态 */
function withSuspense(node: ReactNode) {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[60vh] items-center justify-center">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        </div>
      }
    >
      {node}
    </Suspense>
  );
}

/** 由绝对路径推导后台子路由的相对片段（父路由 path 为 `CMS.PATH`） */
function cmsChild(absolutePath: string): string {
  return absolutePath.slice(CMS.PATH.length + 1);
}

/**
 * 后台路由：**仅当 `CMS.PATH !== ''`**（后台已启用）时注入。
 *
 * - `/login`、`/reset-password` 为**顶级路由**（登录前的闸门页，不套 `CmsLayout` / 守卫）；
 * - `/password`（常规改密）挂在 `CMS.PATH` 的 children 下 —— 运营是**登录后**才改密，
 *   应与其他管理页一致地位于后台外壳（侧栏 + 顶栏）之内，便于随时返回其它模块。
 * - 后台根 `CMS.PATH` 经 `CmsProtectedRoute` 守卫（无 Token 跳登录），内嵌 `CmsLayout`
 *   作为壳，子路由为仪表盘与各管理页（含修改密码）。
 * - 路径一律来自 `CMS_ROUTES` 常量，禁止散写字符串。
 */
const cmsRoutes: RouteObject[] =
  CMS.PATH === ''
    ? []
    : [
        { path: CMS_ROUTES.LOGIN, element: withSuspense(<CmsLogin />) },
        { path: CMS_ROUTES.RESET_PASSWORD, element: withSuspense(<CmsResetPassword />) },
        {
          path: CMS.PATH,
          element: (
            <CmsProtectedRoute>
              <CmsLayout />
            </CmsProtectedRoute>
          ),
          children: [
            { index: true, element: withSuspense(<CmsDashboard />) },
            { path: cmsChild(CMS_ROUTES.PASSWORD), element: withSuspense(<CmsChangePassword />) },
            { path: cmsChild(CMS_ROUTES.PRODUCTS), element: withSuspense(<CmsProductsManage />) },
            { path: cmsChild(CMS_ROUTES.NEWS), element: withSuspense(<CmsNewsManage />) },
            { path: cmsChild(CMS_ROUTES.CASES), element: withSuspense(<CmsCasesManage />) },
            {
              path: cmsChild(CMS_ROUTES.ADVANTAGES),
              element: withSuspense(<CmsAdvantagesManage />),
            },
            { path: cmsChild(CMS_ROUTES.ABOUT), element: withSuspense(<CmsAboutManage />) },
            { path: cmsChild(CMS_ROUTES.SITE), element: withSuspense(<CmsSiteConfigManage />) },
            { path: cmsChild(CMS_ROUTES.MESSAGES), element: withSuspense(<CmsMessagesManage />) },
            { path: cmsChild(CMS_ROUTES.ACCOUNTS), element: withSuspense(<CmsAccountsManage />) },
            { path: cmsChild(CMS_ROUTES.OPLOGS), element: withSuspense(<CmsLogsManage />) },
          ],
        },
      ];

/**
 * 路由表：后台路由（可选）+ 前台主布局嵌套路由 + 404。
 * 所有路径均来自 ROUTES / CMS_ROUTES 常量，禁止散写字符串。
 */
export const router = createBrowserRouter([
  ...cmsRoutes,
  {
    path: ROUTES.HOME,
    element: <MainLayout />,
    children: [
      { index: true, element: withSuspense(<Home />) },
      { path: ROUTES.ABOUT.replace(/^\//, ''), element: withSuspense(<About />) },
      { path: ROUTES.PRODUCTS.replace(/^\//, ''), element: withSuspense(<Products />) },
      {
        path: `${ROUTES.PRODUCTS.replace(/^\//, '')}/:id`,
        element: withSuspense(<ProductDetail />),
      },
      { path: ROUTES.NEWS.replace(/^\//, ''), element: withSuspense(<News />) },
      {
        path: `${ROUTES.NEWS.replace(/^\//, '')}/:id`,
        element: withSuspense(<NewsDetail />),
      },
      { path: ROUTES.CONTACT.replace(/^\//, ''), element: withSuspense(<Contact />) },
      { path: '*', element: withSuspense(<NotFound />) },
    ],
  },
]);

export default router;
