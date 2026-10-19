import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CMS_ROUTES } from '@/constants';
import { listContent } from '@/services/cms';

/** 统计卡片配置 */
interface StatCard {
  label: string;
  path: string;
  /** 统计读取函数 */
  loader: () => Promise<number>;
}

/** 各内容模块统计入口（复用 listContent 读 total，不新增后端接口） */
const STAT_CARDS: StatCard[] = [
  { label: '产品', path: CMS_ROUTES.PRODUCTS, loader: () => listContent('product', { page: 1, size: 1 }).then((r) => r.total) },
  { label: '新闻', path: CMS_ROUTES.NEWS, loader: () => listContent('news', { page: 1, size: 1 }).then((r) => r.total) },
  { label: '案例', path: CMS_ROUTES.CASES, loader: () => listContent('case', { page: 1, size: 1 }).then((r) => r.total) },
  { label: '优势', path: CMS_ROUTES.ADVANTAGES, loader: () => listContent('advantage', { page: 1, size: 1 }).then((r) => r.total) },
];

/**
 * 后台仪表盘：欢迎语 + 各内容模块统计 / 快捷入口。
 *
 * 统计失败静默处理（不阻塞页面），展示为「—」；整个请求不发散、不新增后端接口。
 */
export default function Dashboard() {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const entries = await Promise.all(
        STAT_CARDS.map(async (card) => {
          try {
            const total = await card.loader();
            return [card.label, total] as const;
          } catch {
            // 失败静默：交由 guard 处理认证跳转；其余错误展示为「—」
            return [card.label, null] as const;
          }
        }),
      );

      if (!cancelled) {
        setCounts(Object.fromEntries(entries));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* 欢迎语 */}
      <div className="rounded-md border border-border bg-white p-6">
        <h2 className="text-h3 font-semibold text-text">欢迎回来 👋</h2>
        <p className="mt-2 text-sm text-text-secondary">
          在这里统一管理网站的产品、新闻、案例、优势、关于我们与客户留言内容。
        </p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STAT_CARDS.map((card) => (
          <Link
            key={card.label}
            to={card.path}
            className="rounded-md border border-border bg-white p-5 transition-colors hover:border-primary"
          >
            <p className="text-sm text-text-secondary">{card.label}</p>
            <p className="mt-2 text-h2 font-bold text-primary">
              {loading ? '…' : (counts[card.label] ?? '—')}
            </p>
            <p className="mt-1 text-xs text-text-muted">共 {card.label}内容</p>
          </Link>
        ))}
      </div>

      {/* 快捷入口 */}
      <div className="rounded-md border border-border bg-white p-6">
        <h3 className="mb-4 text-sm font-semibold text-text">快捷入口</h3>
        <div className="flex flex-wrap gap-3">
          <QuickLink to={CMS_ROUTES.ABOUT} label="编辑「关于我们」" />
          <QuickLink to={CMS_ROUTES.MESSAGES} label="查看客户留言" />
          <QuickLink to={CMS_ROUTES.PRODUCTS} label="新增产品" />
          <QuickLink to={CMS_ROUTES.NEWS} label="发布新闻" />
        </div>
      </div>
    </div>
  );
}

/** 快捷入口按钮 */
function QuickLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="rounded-btn border border-border px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
    >
      {label}
    </Link>
  );
}
