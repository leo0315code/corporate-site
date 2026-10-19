import type { ImgHTMLAttributes } from 'react';
import { thumbUrl } from '@/utils/image';

/** ThumbImage 属性：src 为**原图**地址，其余透传给 img */
export interface ThumbImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  /** 原图地址（组件内部自动换成缩略图） */
  src: string;
  /** 是否禁用缩略图（详情页等需要原图的场景传 true） */
  original?: boolean;
}

/**
 * 列表用缩略图组件
 *
 * - 自动把 `/uploads/**` 的原图换为 `_thumb.webp`（见 `thumbUrl`）；
 * - 缩略图 404 / 解码失败时**自动回退原图**（`dataset.fallback` 防死循环）；
 * - 历史图片、GIF、静态占位图 `thumbUrl` 会原样返回，行为与普通 img 一致。
 */
export default function ThumbImage({ src, original = false, ...rest }: ThumbImageProps) {
  const resolved = original ? src : thumbUrl(src);

  return (
    <img
      {...rest}
      src={resolved}
      onError={(event) => {
        const img = event.currentTarget;
        if (original || img.dataset.fallback === '1' || img.src.endsWith(src)) {
          return;
        }
        img.dataset.fallback = '1';
        img.src = src;
      }}
    />
  );
}
