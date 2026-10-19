import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CMS_ROUTES } from '@/constants';
import { fetchProfile, logout as cmsLogout } from '@/services/cms';
import { clearToken, handleAuthError } from '@/utils/authToken';
import type { AdminProfile } from '@/types';

/** 导航图标名 */
type NavIconName =
  | 'dashboard'
  | 'product'
  | 'news'
  | 'case'
  | 'advantage'
  | 'about'
  | 'site'
  | 'message'
  | 'account'
  | 'oplog'
  | 'password';

/** 后台导航项（路径严格来自 CMS_ROUTES，禁止散写字符串） */
interface CmsNavItem {
  to: string;
  label: string;
  icon: NavIconName;
  /** 精确匹配（用于仪表盘根路径） */
  end?: boolean;
}

/** 后台左栏导航配置 */
const NAV_ITEMS: CmsNavItem[] = [
  { to: CMS_ROUTES.DASHBOARD, label: '仪表盘', icon: 'dashboard', end: true },
  { to: CMS_ROUTES.PRODUCTS, label: '产品管理', icon: 'product' },
  { to: CMS_ROUTES.NEWS, label: '新闻管理', icon: 'news' },
  { to: CMS_ROUTES.CASES, label: '案例管理', icon: 'case' },
  { to: CMS_ROUTES.ADVANTAGES, label: '优势管理', icon: 'advantage' },
  { to: CMS_ROUTES.ABOUT, label: '关于我们', icon: 'about' },
  { to: CMS_ROUTES.SITE, label: '网站配置', icon: 'site' },
  { to: CMS_ROUTES.MESSAGES, label: '留言管理', icon: 'message' },
  { to: CMS_ROUTES.ACCOUNTS, label: '账号管理', icon: 'account' },
  { to: CMS_ROUTES.OPLOGS, label: '操作日志', icon: 'oplog' },
  { to: CMS_ROUTES.PASSWORD, label: '修改密码', icon: 'password' },
];

/** 图标 path 数据（内联 SVG，避免新增依赖） */
const ICON_PATHS: Record<NavIconName, string> = {
  dashboard: 'M3 12h7V3H3v9Zm0 9h7v-5H3v5Zm11 0h7v-9h-7v9Zm0-18v5h7V3h-7Z',
  product: 'M20 8l-8-4-8 4m16 0l-8 4m8-4v8l-8 4m0-8L4 8m8 4v8m-8-8v8l8 4',
  news: 'M6 3h9l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 6h6M9 13h6M9 17h4',
  case: 'M4 8h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8Zm5 0V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2',
  advantage: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  about: 'M12 8h.01M11 12h1v5h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  site: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.5 2.4 4 5.5 4 9s-1.5 6.6-4 9m0-18c-2.5 2.4-4 5.5-4 9s1.5 6.6 4 9M3.5 9h17M3.5 15h17',
  message: 'M4 5h16v11H8l-4 4V5Z',
  account: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  oplog: 'M8 4h8a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm2 4h4M10 12h4M10 16h2',
  password: 'M14 7a4 4 0 1 0-3.6 4H12l1.5 1.5L15 11l1.5 1.5L18 11l-1-1H13.9A4 4 0 0 0 14 7Z',
};

/**
 * 导航图标
 * @param props.name 图标名
 */
function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path
        d={ICON_PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 侧栏导航（桌面常驻 / 移动抽屉共用）
 * @param props.onNavigate 点击导航项后的回调（移动端用于关闭抽屉）
 */
function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-btn px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-light text-primary'
                : 'text-text-secondary hover:bg-bg-soft hover:text-primary'
            }`
          }
        >
          <NavIcon name={item.icon} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** 侧栏品牌头（Logo + 标题） */
function SidebarBrand() {
  return (
    <div className="flex h-16 items-center border-b border-border px-5">
      <span className="flex h-8 w-8 items-center justify-center rounded-btn bg-primary text-sm font-bold text-white">
        CMS
      </span>
      <span className="ml-3 text-sm font-semibold text-text">内容管理后台</span>
    </div>
  );
}

/**
 * 后台布局：左栏导航（桌面常驻 w-60）+ 顶部条（页面标题 / 账号 / 登出）+ 内容区。
 *
 * - 全宽布局：内容区**不使用** `mx-auto max-w-*` 居中容器。
 * - 移动端：侧栏改为抽屉（汉堡开合 + 遮罩点击关闭），路由切换自动收起。
 * - 账号名来自 `fetchProfile()`；失败交由 `handleAuthError` 分流（1003→登录 / 1006→改密）。
 */
export default function CmsLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [profile, setProfile] = useState<AdminProfile | null>(null);

  // 当前页面标题：按前缀匹配导航项（仪表盘需精确匹配）
  const currentTitle =
    NAV_ITEMS.find((item) => {
      if (item.end) {
        return location.pathname === item.to;
      }
      return location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
    })?.label ?? '内容管理后台';

  // 拉取当前账号资料
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchProfile();
        if (!cancelled) {
          setProfile(data);
        }
      } catch (err) {
        // 1003/1006 已由 cms.ts 的 guard 调用 handleAuthError 分流；此处再兜底一次
        handleAuthError(err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 路由切换时收起抽屉
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // 抽屉展开时锁定页面滚动
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [drawerOpen]);

  /** 登出：调用后端 → 清本地 Token → 跳登录页 */
  const handleLogout = async (): Promise<void> => {
    await cmsLogout();
    clearToken();
    navigate(CMS_ROUTES.LOGIN, { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-bg-soft">
      {/* 桌面端常驻侧栏 */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-white lg:flex">
        <SidebarBrand />
        <SidebarNav />
      </aside>

      {/* 移动端抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* 遮罩 */}
          <button
            type="button"
            aria-label="关闭菜单"
            className="absolute inset-0 bg-secondary/40"
            onClick={() => setDrawerOpen(false)}
          />
          {/* 抽屉面板 */}
          <div className="absolute left-0 top-0 flex h-full w-60 flex-col border-r border-border bg-white">
            <SidebarBrand />
            <SidebarNav onNavigate={() => setDrawerOpen(false)} />
          </div>
        </div>
      )}

      {/* 主区域 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部条 */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-border bg-white px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* 汉堡按钮（移动端） */}
            <button
              type="button"
              className="flex h-10 w-10 items-center justify-center rounded-btn text-secondary lg:hidden"
              aria-label={drawerOpen ? '关闭菜单' : '打开菜单'}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen((prev) => !prev)}
            >
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <path
                  d="M4 6h16M4 12h16M4 18h16"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            <h1 className="truncate text-base font-semibold text-text md:text-h3">{currentTitle}</h1>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-text-secondary sm:inline">
              {profile ? profile.username : '加载中…'}
            </span>
            <Link
              to={CMS_ROUTES.PASSWORD}
              className="hidden rounded-btn border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary sm:inline-block"
            >
              修改密码
            </Link>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-btn border border-border px-3 py-1.5 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
            >
              登出
            </button>
          </div>
        </header>

        {/* 内容区（全宽，无居中容器） */}
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
