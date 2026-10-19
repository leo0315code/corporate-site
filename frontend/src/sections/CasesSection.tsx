import Container from '@/components/common/Container';
import SectionTitle from '@/components/common/SectionTitle';
import Card from '@/components/common/Card';
import { SectionEmpty, SectionError, SkeletonCard } from '@/components/common/AsyncState';
import type { CaseItem } from '@/types';

export interface CasesSectionProps {
  /** 案例数据（首页聚合返回全量，直接渲染） */
  cases?: CaseItem[];
  /** 是否加载中 */
  loading?: boolean;
  /** 加载错误（加载失败且无数据时展示错误 + 重试） */
  error?: unknown;
  /** 重试回调 */
  onRetry?: () => void;
}

/**
 * 首页客户案例 / 合作伙伴：Logo 墙 + 案例说明。
 * 三态：加载骨架 / 错误 + 重试 / 空态。
 */
export default function CasesSection({
  cases = [],
  loading = false,
  error = null,
  onRetry,
}: CasesSectionProps) {
  return (
    <section className="section-padding">
      <Container>
        <SectionTitle
          eyebrow="客户案例"
          title="他们都在使用我们的服务"
          subtitle="覆盖多个行业的成功实践，是我们专业能力最好的证明"
        />

        {loading ? (
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((slot) => (
              <SkeletonCard key={slot} />
            ))}
          </div>
        ) : cases.length === 0 ? (
          error ? (
            <SectionError onRetry={onRetry} />
          ) : (
            <SectionEmpty text="暂无案例" />
          )
        ) : (
          <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cases.map((item) => (
              <Card key={item.id} hoverable className="flex items-start gap-4">
                <img
                  src={item.logo}
                  alt={item.name}
                  className="h-12 w-12 shrink-0 rounded-md object-contain"
                  loading="lazy"
                />
                <div>
                  <h3 className="text-base font-semibold text-secondary">{item.name}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                    {item.desc}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
