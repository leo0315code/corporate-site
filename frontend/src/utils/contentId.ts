/**
 * 内容 id 生成工具
 *
 * 背景：产品 / 新闻 / 案例的 `id` 是业务主键，且**直接构成前台详情页 URL**
 * （`/products/:id`、`/news/:id`），因此：
 * - **新增**时可自动生成一个可读且足够唯一的 id（或由用户手动指定）；
 * - **编辑**时一律只读，绝不修改 —— 否则既有分享链接 / 收藏会失效。
 *
 * 生成格式：`{prefix}-{YYYYMMDD}-{随机5位十六进制}`，例如 `product-20261017-1a3f9`。
 * - 日期段便于人工识别创建时间；
 * - 随机段使用 `crypto.getRandomValues`（不可预测，避免被枚举）；
 * - 总长度约 22 字符，远低于后端 80 字符上限。
 */

/**
 * 生成内容 id
 *
 * @param prefix 业务前缀（如 product / news / case）
 * @returns 形如 `product-20261017-1a3f9` 的 id
 */
export function generateContentId(prefix: string): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;

  return `${prefix}-${date}-${randomHex(5)}`;
}

/**
 * 生成指定长度的十六进制随机串
 *
 * 优先使用 `crypto.getRandomValues`；在不可用的环境（如非安全上下文 / 极老浏览器）
 * 退化为基于 `Math.random` 的实现，保证功能不中断。
 *
 * @param length 长度（十六进制字符数）
 * @returns 小写十六进制串
 */
function randomHex(length: number): string {
  const bytes = Math.ceil(length / 2);
  const buffer = new Uint8Array(bytes);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(buffer);
  } else {
    for (let i = 0; i < bytes; i += 1) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
  }

  let hex = '';
  for (let i = 0; i < bytes; i += 1) {
    hex += buffer[i].toString(16).padStart(2, '0');
  }

  return hex.slice(0, length);
}
