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
 *
 * 安全取舍（**不接受 SVG**）：SVG 是 XML 文档，同源直接访问 `uploads/*.svg` 时浏览器会以
 * 文档方式执行其中的脚本，可读取 `localStorage` 中的管理 Token，构成存储型 XSS 通道。
 * 因此 MIME 白名单只保留位图，SVG 一律拒绝；图标类需求由前端组件（ProductIcon）或
 * 转成 PNG/WebP 后上传。
 *
 * 5. **随机文件名**：`random_bytes` 生成，完全丢弃用户提供的文件名，杜绝路径穿越 / 覆盖；
 * 6. **落盘目录**：固定 `public/uploads/{type}/`，`type` 仅在白名单内取值；
 * 7. **目录加固**：`public/uploads/.htaccess` 禁止脚本执行（Apache），
 *    且 `router.php` 只对**真实存在的文件**放行，非文件请求仍走应用入口。
 *
 * 返回给前端的仅为**相对路径**（如 `/uploads/product/9f3c….png`），前端直接写入
 * `image` / `cover` / `logo` 字段即可，无需拼接域名。
 *
 * 派生图（编辑体验优化，失败不影响上传）：
 * - **缩略图** `<随机名>_thumb.webp`（宽 ≤ 480，WebP 质量 80）——列表页/首页卡片用它，
 *   避免列表按 5MB 原图加载；GIF 跳过（保留动图）。
 * - **原图压缩**：jpg / webp 且 > 800KB 时，最长边缩到 1920、质量 82 原地重编码；
 *   PNG 不重编码（无损，且体积收益有限）。
 * - 派生失败一律静默降级：原图照常可用，前端 `thumbUrl()` 命名约定不命中时回退原图。
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
     * 注意：**不含 SVG**（见类注释「安全取舍」）。`text/xml` / `text/plain` 同样不放行，
     * 否则任何 XML/纯文本都能冒充图片落盘。
     *
     * @var array<string, string[]>
     */
    protected const MIME_EXT_MAP = [
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/png'  => ['png'],
        'image/webp' => ['webp'],
        'image/gif'  => ['gif'],
    ];

    /** 上传表单字段名（前端 FormData 的 key） */
    public const FIELD = 'file';

    /** 缩略图文件名后缀（**前端 `thumbUrl()` 依赖此约定**，改动需同步前端） */
    public const THUMB_SUFFIX = '_thumb.webp';

    /** 缩略图目标宽度（px） */
    protected const THUMB_WIDTH = 480;

    /** 缩略图 WebP 质量 */
    protected const THUMB_QUALITY = 80;

    /** 原图压缩阈值（字节）：jpg/webp 超过则重编码 */
    protected const COMPRESS_THRESHOLD = 800 * 1024;

    /** 原图最长边上限（px） */
    protected const MAX_EDGE = 1920;

    /** 原图重编码质量 */
    protected const REENCODE_QUALITY = 82;

    /**
     * 处理单张图片上传
     *
     * 埋点（C-P1-3）：成功记 `upload/upload`（target=相对路径，target_name=原始文件名，
     * detail=`{path}, {size}KB, {mime}`）；各失败分支记 `result=0` + 原因。**不记二进制内容**。
     *
     * @param UploadedFile|null $file 上传文件（`Request::file('file')` 结果）
     * @param string            $type 业务类型（product|news|case|common）
     * @param OpLogContext|null $ctx  操作日志上下文
     * @return Response 统一响应；成功时 data = { url, path, thumb, size, mime, name }
     *                  （`thumb` 为列表用缩略图，未生成时为空串）
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
            return fail($code['VALIDATE_FAIL'], '仅支持 jpg / png / webp / gif 格式的图片');
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

            $absolute = $saveDir . DIRECTORY_SEPARATOR . $name;
            $relative = '/' . self::UPLOAD_DIR . '/' . $type . '/' . $name;

            // 派生图（失败不影响上传结果，见类注释）
            $this->compressOriginal($absolute, $mime);
            $thumb = $this->makeThumb($absolute, $mime, $relative);

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
                'url'   => $relative,
                'path'  => $relative,
                'thumb' => $thumb,
                'size'  => $size,
                'mime'  => $mime,
                'name'  => $name,
            ]);
        } catch (\Throwable $e) {
            Log::error('[cms:upload] 图片保存失败：' . $e->getMessage());
            OpLogService::record('upload', 'upload', 0, '上传失败：保存异常', '', $originalName, $ctx);

            return fail($code['SERVER_ERROR'], '图片保存失败，请稍后重试');
        }
    }

    /**
     * 缩略图文件名（由原文件名派生，纯字符串运算，便于单测）
     *
     * @param string $name 原文件名（如 `9f3c….png`）
     * @return string 缩略图文件名（如 `9f3c…_thumb.webp`）
     */
    public static function thumbName(string $name): string
    {
        return pathinfo($name, PATHINFO_FILENAME) . self::THUMB_SUFFIX;
    }

    /**
     * 生成列表用缩略图（WebP，宽 ≤ 480）
     *
     * 任何一步失败都返回空串，绝不抛出——派生图只是优化，不能拖垮上传。
     *
     * @param string $absolute 原图绝对路径
     * @param string $mime     真实 MIME
     * @param string $relative 原图对外相对路径（`/uploads/{type}/{name}`）
     * @return string 缩略图相对路径；未生成时为空串
     */
    protected function makeThumb(string $absolute, string $mime, string $relative): string
    {
        // GIF 跳过：重编码会丢掉动图
        if ($mime === 'image/gif') {
            return '';
        }
        if (!function_exists('imagecreatetruecolor') || !function_exists('imagewebp')) {
            return '';
        }

        try {
            $info = @getimagesize($absolute);
            if (!is_array($info) || ($info[0] ?? 0) < 2 || ($info[1] ?? 0) < 2) {
                return '';
            }
            [$width, $height] = $info;

            $source = $this->createImage($absolute, $mime);
            if ($source === null) {
                return '';
            }

            $targetWidth  = min(self::THUMB_WIDTH, $width);
            $targetHeight = (int) max(1, round($height * $targetWidth / $width));

            $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
            if ($canvas === false) {
                imagedestroy($source);
                return '';
            }

            // 保留透明通道（PNG / WebP 带 alpha 时不出现黑底）
            imagealphablending($canvas, false);
            imagesavealpha($canvas, true);
            $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
            imagefilledrectangle($canvas, 0, 0, $targetWidth, $targetHeight, (int) $transparent);
            imagecopyresampled(
                $canvas,
                $source,
                0,
                0,
                0,
                0,
                $targetWidth,
                $targetHeight,
                $width,
                $height
            );

            $thumbAbsolute = dirname($absolute) . DIRECTORY_SEPARATOR . self::thumbName(basename($absolute));
            $ok = imagewebp($canvas, $thumbAbsolute, self::THUMB_QUALITY);

            imagedestroy($canvas);
            imagedestroy($source);

            return $ok ? self::thumbRelativeOf($relative) : '';
        } catch (\Throwable $e) {
            Log::warning('[cms:upload] 缩略图生成失败：' . $e->getMessage());
            return '';
        }
    }

    /**
     * 由原图相对路径推缩略图相对路径（`/uploads/p/a.png` → `/uploads/p/a_thumb.webp`）
     *
     * @param string $relative 原图相对路径
     * @return string
     */
    public static function thumbRelativeOf(string $relative): string
    {
        $dir = rtrim(dirname($relative), '/\\');
        return $dir . '/' . self::thumbName(basename($relative));
    }

    /**
     * 原图压缩：jpg / webp 且体积 > 800KB 时，最长边压到 1920、质量 82 原地重编码
     *
     * PNG 不处理（无损重编码收益有限且耗时）。失败静默忽略。
     *
     * @param string $absolute 原图绝对路径
     * @param string $mime     真实 MIME
     * @return void
     */
    protected function compressOriginal(string $absolute, string $mime): void
    {
        if (!in_array($mime, ['image/jpeg', 'image/webp'], true)) {
            return;
        }
        if (!function_exists('imagecreatetruecolor')) {
            return;
        }

        try {
            $size = (int) @filesize($absolute);
            $info = @getimagesize($absolute);
            if (!is_array($info) || ($info[0] ?? 0) < 1 || ($info[1] ?? 0) < 1) {
                return;
            }
            [$width, $height] = $info;
            $longEdge = max($width, $height);

            if ($size <= self::COMPRESS_THRESHOLD && $longEdge <= self::MAX_EDGE) {
                return;
            }

            $source = $this->createImage($absolute, $mime);
            if ($source === null) {
                return;
            }

            $scale        = $longEdge > self::MAX_EDGE ? self::MAX_EDGE / $longEdge : 1.0;
            $targetWidth  = (int) max(1, round($width * $scale));
            $targetHeight = (int) max(1, round($height * $scale));

            $canvas = imagecreatetruecolor($targetWidth, $targetHeight);
            if ($canvas === false) {
                imagedestroy($source);
                return;
            }
            imagecopyresampled(
                $canvas,
                $source,
                0,
                0,
                0,
                0,
                $targetWidth,
                $targetHeight,
                $width,
                $height
            );

            if ($mime === 'image/jpeg') {
                imagejpeg($canvas, $absolute, self::REENCODE_QUALITY);
            } else {
                imagewebp($canvas, $absolute, self::REENCODE_QUALITY);
            }

            imagedestroy($canvas);
            imagedestroy($source);
        } catch (\Throwable $e) {
            Log::warning('[cms:upload] 原图压缩失败：' . $e->getMessage());
        }
    }

    /**
     * 按 MIME 载入 GD 图像资源
     *
     * @param string $absolute 图片绝对路径
     * @param string $mime     真实 MIME
     * @return \GdImage|null 载入失败返回 null
     */
    protected function createImage(string $absolute, string $mime): ?\GdImage
    {
        $image = match ($mime) {
            'image/jpeg' => function_exists('imagecreatefromjpeg') ? @imagecreatefromjpeg($absolute) : false,
            'image/png'  => function_exists('imagecreatefrompng') ? @imagecreatefrompng($absolute) : false,
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($absolute) : false,
            default      => false,
        };

        return $image instanceof \GdImage ? $image : null;
    }

    /**
     * 探测文件真实 MIME（finfo，以内容为准）
     *
     * 不使用扩展名、不信任客户端 `Content-Type`；finfo 不可用时直接返回空串（一律拒绝），
     * 宁可上传失败也不放行未识别内容。
     *
     * @param UploadedFile $file 上传文件
     * @return string 归一化后的 MIME（无法判定时返回空串）
     */
    protected function detectMime(UploadedFile $file): string
    {
        if (!function_exists('finfo_open')) {
            return '';
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        if ($finfo === false) {
            return '';
        }

        $detected = finfo_file($finfo, $file->getPathname());
        finfo_close($finfo);

        return is_string($detected) ? strtolower($detected) : '';
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
