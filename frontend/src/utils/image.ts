/**
 * 图片派生路径工具
 *
 * 背景：后台上传时会**额外生成一张缩略图**（宽 ≤ 480 的 WebP），命名规则固定为
 * `<原名>_thumb.webp`（后端 `UploadService::THUMB_SUFFIX`）。
 * 列表页 / 首页卡片改用缩略图，详情页仍用原图，避免列表按 5MB 原图加载。
 *
 * 兼容策略：历史图片、`public/` 静态占位图、外链图片、GIF（动图不生成缩略图）
 * 一律**原样返回**；即使命名命中但文件缺失，`ThumbImage` 组件会自动回退原图。
 */

/** 缩略图后缀（与后端 `UploadService::THUMB_SUFFIX` 保持一致） */
export const THUMB_SUFFIX = '_thumb.webp';

/**
 * 由原图 URL 推导缩略图 URL
 *
 * @param url 原图路径（如 `/uploads/product/abc.png`）
 * @returns 缩略图路径（如 `/uploads/product/abc_thumb.webp`）；不可派生时返回原值
 */
export function thumbUrl(url: string): string {
  const value = (url || '').trim();
  if (value === '') {
    return value;
  }
  // 仅处理本站上传目录；public 静态图与外链不派生
  if (!value.startsWith('/uploads/')) {
    return value;
  }
  // 已经是缩略图
  if (value.endsWith(THUMB_SUFFIX)) {
    return value;
  }
  // GIF 动图无缩略图
  if (/\.gif$/i.test(value)) {
    return value;
  }
  if (!/\.(jpe?g|png|webp)$/i.test(value)) {
    return value;
  }

  return value.replace(/\.[a-z0-9]+$/i, THUMB_SUFFIX);
}
