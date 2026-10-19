import Container from '@/components/common/Container';
import SectionTitle from '@/components/common/SectionTitle';
import { SectionEmpty, SectionError, SkeletonBlock } from '@/components/common/AsyncState';
import type { AdvantageItem } from '@/types';

export interface StatsSectionProps {
  /** 优势数据（首页聚合返回全量，直接渲染） */
  advantages?: AdvantageItem[];
  /** 是否加载中 */
  loading?: boolean;
  /** 加载错误（加载失败且无数据时展示错误 + 重试） */
  error?: unknown;
  /** 重试回调 */
  onRetry?: () => void;
}

/**
 * 首页「数据与优势」区块：深色背景 + 关键数字卡片。
 * 三态：加载骨架 / 错误 + 重试 / 空态（浅色文案适配深色背景）。
 */
export default function StatsSection({
  advantages = [],
  loading = false,
  error = null,
  onRetry,
}: StatsSectionProps) {
  return (
    <section className="section-padding bg-secondary">
      <Container>
        <SectionTitle
          eyebrow="数据与优势"
          title="用实力赢得信任"
          subtitle="持续投入技术研发与服务体系，为客户创造可衡量的业务价值"
          light
        />

        {loading ? (
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot} className="flex justify-center">
                <SkeletonBlock lines={3} className="w-24" />
              </div>
            ))}
          </div>
        ) : advantages.length === 0 ? (
          error ? (
            <SectionError tone="light" onRetry={onRetry} />
          ) : (
            <SectionEmpty tone="light" text="暂无数据" />
          )
        ) : (
          <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
            {advantages.map((item) => (
              <div key={item.label} className="text-center">
                <div className="text-4xl font-bold text-white md:text-[44px]">
                  {item.value}
                </div>
                <div className="mt-3 text-sm font-medium text-accent">{item.label}</div>
                <div className="mt-2 text-xs leading-relaxed text-white/50">
                  {item.desc}
                </div>
              </div>
            ))}
          </div>
        )}
      </Container>
    </section>
  );
}
