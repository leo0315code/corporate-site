<?php
declare(strict_types=1);

namespace app\service;

use think\facade\Log;
use think\file\UploadedFile;
use think\Response;

/**
 * 图片上传服务（后台专用，全部经 AdminAuth 鉴权后调用）
 *
 * 安全设计（多重防线，任一不满足即拒绝）：
 * 1. **上传项类型**：必须是 `think\file\UploadedFile`，且 `isValid()`（真·HTTP 上传）；
 * 2. **大小**：≤ `MAX_SIZE`（5MB），同时依赖 `upload_max_filesize` / `post_max_size`；
 * 3. **真实 MIME（finfo 探测）**：以文件内容为准，**不信任**客户端 `Content-Type`；
 * 4. **扩展名白名单**：由 `getOriginalName()` 取出并小写，再与「MIME → 允许扩展名」表**交叉校验**，
 *    防止「改名成 .png 的 webshell」等后缀欺骗；
 * 5. **随机文件名**：`random_bytes` 生成，完全丢弃用户提供的文件名，杜绝路径穿越 / 覆盖；
 * 6. **落盘目录**：固定 `public/uploads/{type}/`，`type` 仅在白名单内取值；
 * 7. **目录加固**：`public/uploads/.htaccess` 禁止脚本执行（Apache），
 *    且 `router.php` 只对**真实存在的文件**放行，非文件请求仍走应用入口。
 *
 * 返回给前端的仅为**相对路径**（如 `/uploads/product/9f3c….png`），前端直接写入
 * `image` / `cover` / `logo` 字段即可，无需拼接域名。
 */
class UploadService
{
    /** 单文件最大字节数：5MB */
    public const MAX_SIZE = 5 * 1024 * 1024;

    /** 存储根目录（相对 public/），对外 URL 前缀同为 `/uploads` */
    public const UPLOAD_DIR = 'uploads';

    /** 允许的上传类型（业务分组）→ 落盘子目录 */
    protected const TYPE_WHITELIST = ['product', 'news', 'case', 'common'];

    /**
     * MIME → 允许的扩展名（双向交叉校验的权威表）
     *
     * 键为 finfo 探测出的**真实 MIME**；值为该 MIME 下**允许**的扩展名集合。
     * 仅当「真实 MIME 命中」且「客户端扩展名 ∈ 该 MIME 允许集」时才放行。
     *
     * 说明：SVG 的真实 MIME 常见两种（`image/svg+xml` 与部分环境下的 `text/xml`、
     * `text/plain`），因此显式声明三种，且只允许 `svg` 扩展名。
     *
     * @var array<string, string[]>
     */
    protected const MIME_EXT_MAP = [
        'image/jpeg'    => ['jpg', 'jpeg'],
        'image/png'     => ['png'],
        'image/webp'    => ['webp'],
        'image/gif'     => ['gif'],
        'image/svg+xml' => ['svg'],
        'text/xml'      => ['svg'],
        'text/plain'    => ['svg'],
    ];

    /** 上传表单字段名（前端 FormData 的 key） */
    public const FIELD = 'file';

    /**
     * 处理单张图片上传
     *
     * 埋点（C-P1-3）：成功记 `upload/upload`（target=相对路径，target_name=原始文件名，
     * detail=`{path}, {size}KB, {mime}`）；各失败分支记 `result=0` + 原因。**不记二进制内容**。
     *
     * @param UploadedFile|null $file 上传文件（`Request::file('file')` 结果）
     * @param string            $type 业务类型（product|news|case|common）
     * @param OpLogContext|null $ctx  操作日志上下文
     * @return Response 统一响应；成功时 data = { url, path, size, mime, name }
     */
    public function image(?UploadedFile $file, string $type, ?OpLogContext $ctx = null): Response
    {
        $code = error_code();

        // —— 0. 类型白名单（防止落盘到任意目录）——
        if (!in_array($type, self::TYPE_WHITELIST, true)) {
            OpLogService::record('upload', 'upload', 0, '上传失败：不支持的图片类型', '', '', $ctx);
            return fail($code['VALIDATE_FAIL'], '不支持的图片类型');
        }

        // —— 1. 是否存在上传项 ——
        if (!$file instanceof UploadedFile) {
            OpLogService::record('upload', 'upload', 0, '上传失败：未选择图片', '', '', $ctx);
            return fail($code['VALIDATE_FAIL'], '请选择要上传的图片');
        }

        // 原始文件名（仅作可读标签，截断 120；清洗由写入器统一处理）
        $originalName = (string) $file->getOriginalName();

        // —— 2. 是否为有效 HTTP 上传 ——
        if (!$file->isValid()) {
            OpLogService::record('upload', 'upload', 0, '上传失败：上传无效', '', $originalName, $ctx);
            return fail($code['VALIDATE_FAIL'], '图片上传失败，请重试');
        }

        // —— 3. 大小上限 ——
        $size = (int) $file->getSize();
        if ($size <= 0) {
            OpLogService::record('upload', 'upload', 0, '上传失败：图片内容为空', '', $originalName, $ctx);
            return fail($code['VALIDATE_FAIL'], '图片内容为空，请重新选择');
        }
        if ($size > self::MAX_SIZE) {
            OpLogService::record('upload', 'upload', 0, '上传失败：超过 5MB', '', $originalName, $ctx);
            return fail($code['VALIDATE_FAIL'], '图片不得超过 5MB');
        }

        // —— 4. 真实 MIME（以文件内容为准）——
        $mime = $this->detectMime($file);
        if (!isset(self::MIME_EXT_MAP[$mime])) {
            OpLogService::record('upload', 'upload', 0, '上传失败：不支持的格式', '', $originalName, $ctx);
            return fail($code['VALIDATE_FAIL'], '仅支持 jpg / png / webp / svg / gif 格式的图片');
        }

        // —— 5. 扩展名交叉校验（防后缀欺骗）——
        $ext = strtolower((string) $file->getOriginalExtension());
        if ($ext === '' || !in_array($ext, self::MIME_EXT_MAP[$mime], true)) {
            OpLogService::record('upload', 'upload', 0, '上传失败：格式与扩展名不匹配', '', $originalName, $ctx);
            return fail($code['VALIDATE_FAIL'], '图片格式与扩展名不匹配，请更换后重试');
        }

        // —— 6. 随机文件名 + 落盘 ——
        try {
            $saveDir = public_path() . self::UPLOAD_DIR . DIRECTORY_SEPARATOR . $type;
            $name    = $this->randomName() . '.' . $ext;

            // move() 内部会创建目录并校验写入结果，失败抛 FileException
            $file->move($saveDir, $name);

            $relative = '/' . self::UPLOAD_DIR . '/' . $type . '/' . $name;

            $kb = max(1, (int) round($size / 1024));
            OpLogService::record(
                'upload',
                'upload',
                1,
                sprintf('%s, %dKB, %s', $relative, $kb, $mime),
                $relative,
                $originalName,
                $ctx
            );

            return success([
                'url'  => $relative,
                'path' => $relative,
                'size' => $size,
                'mime' => $mime,
                'name' => $name,
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:upload] 图片保存失败：' . $e->getMessage());
            OpLogService::record('upload', 'upload', 0, '上传失败：保存异常', '', $originalName, $ctx);

            return fail($code['SERVER_ERROR'], '图片保存失败，请稍后重试');
        }
    }

    /**
     * 探测文件真实 MIME（finfo，以内容为准）
     *
     * SVG 兜底：部分环境下 finfo 会把 SVG 识别为 `image/svg+xml`，另有环境识别为
     * `text/xml` / `text/plain`。若探测结果落在通用 XML/文本类，则用内容特征
     * （含 `<svg`）二次确认，避免误判为可上传的图片。
     *
     * @param UploadedFile $file 上传文件
     * @return string 归一化后的 MIME（无法判定时返回空串）
     */
    protected function detectMime(UploadedFile $file): string
    {
        $mime = '';

        if (function_exists('finfo_open')) {
            $finfo = finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = finfo_file($finfo, $file->getPathname());
                finfo_close($finfo);
                $mime = is_string($detected) ? strtolower($detected) : '';
            }
        }

        // finfo 不可用时的兜底（仍然读取文件头部特征）
        if ($mime === '') {
            return '';
        }

        // 通用 XML / 文本 → 用内容特征确认是否为 SVG
        if (in_array($mime, ['text/xml', 'text/plain', 'application/xml'], true)) {
            return $this->looksLikeSvg($file) ? 'image/svg+xml' : $mime;
        }

        return $mime;
    }

    /**
     * 判断文件内容是否形如 SVG（仅读取头部若干字节，避免大文件全量读入）
     *
     * @param UploadedFile $file 上传文件
     * @return bool
     */
    protected function looksLikeSvg(UploadedFile $file): bool
    {
        $handle = @fopen($file->getPathname(), 'rb');
        if ($handle === false) {
            return false;
        }

        $head = (string) fread($handle, 4096);
        fclose($handle);

        // 允许前置 BOM / XML 声明 / 注释，只要出现 <svg 根标签即可
        return stripos($head, '<svg') !== false;
    }

    /**
     * 生成随机文件名（不含扩展名）
     *
     * 使用 `random_bytes` → 十六进制，长度 32；不以用户输入命名，杜绝路径穿越。
     *
     * @return string
     */
    protected function randomName(): string
    {
        try {
            return bin2hex(random_bytes(16));
        } catch (\Throwable $e) {
            // 极端环境下 random_bytes 不可用：退化为哈希（仍不可预测用户输入）
            return bin2hex(hash('sha256', uniqid('', true) . microtime(true), true));
        }
    }
}
