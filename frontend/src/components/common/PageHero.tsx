import type { ReactNode } from 'react';
import Container from '@/components/common/Container';
import Breadcrumb from '@/components/common/Breadcrumb';
import type { BreadcrumbItem } from '@/components/common/Breadcrumb';

export interface PageHeroProps {
  /** 页面主标题 */
  title: string;
  /** 页面副标题/一句话说明 */
  subtitle?: string;
  /** 面包屑条目 */
  breadcrumb: BreadcrumbItem[];
  /** 右侧额外内容（可选） */
  extra?: ReactNode;
}

/**
 * 内页顶部标题横幅：深色背景 + 面包屑 + 标题 + 副标题。
 * 关于/产品/新闻/联系页统一使用，保证内页视觉一致。
 */
export default function PageHero({ title, subtitle, breadcrumb, extra }: PageHeroProps) {
  return (
    <section className="page-hero">
      <Container className="py-12 md:py-16">
        <Breadcrumb items={breadcrumb} light />
        <div className="mt-6 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="text-h3 font-bold text-white md:text-h2">{title}</h1>
            {subtitle ? (
              <p className="mt-4 max-w-2xl text-base text-white/70">{subtitle}</p>
            ) : null}
          </div>
          {extra ? <div className="shrink-0">{extra}</div> : null}
        </div>
      </Container>
    </section>
  );
}
