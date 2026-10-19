export interface SectionTitleProps {
  /** 主标题 */
  title: string;
  /** 副标题（可选） */
  subtitle?: string;
  /** 对齐方式，默认居中 */
  align?: 'center' | 'left';
  /** 顶部小标签（可选，如 "核心业务"） */
  eyebrow?: string;
  /** 是否使用浅色（深色背景上） */
  light?: boolean;
  className?: string;
}

/**
 * 区块标题：主标题 + 副标题（+ 可选顶部小标签）。
 * 视觉上通过色块点缀与字号层级建立节奏感。
 */
export default function SectionTitle({
  title,
  subtitle,
  align = 'center',
  eyebrow,
  light = false,
  className = '',
}: SectionTitleProps) {
  const isCenter = align === 'center';
  const alignClass = isCenter ? 'items-center text-center' : 'items-start text-left';

  return (
    <div className={`flex flex-col ${alignClass} ${className}`}>
      {eyebrow ? (
        <span
          className={`mb-3 inline-flex items-center gap-2 text-sm font-medium tracking-wide ${
            light ? 'text-accent' : 'text-primary'
          }`}
        >
          <span
            className={`inline-block h-1 w-6 rounded-full ${
              light ? 'bg-accent' : 'bg-primary'
            }`}
          />
          {eyebrow}
        </span>
      ) : null}

      <h2
        className={`text-h3 md:text-h2 font-bold ${
          light ? 'text-white' : 'text-secondary'
        }`}
      >
        {title}
      </h2>

      {subtitle ? (
        <p
          className={`mt-4 max-w-2xl text-base md:text-lg ${
            light ? 'text-white/70' : 'text-text-secondary'
          }`}
        >
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
