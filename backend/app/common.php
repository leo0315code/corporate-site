<?php
// +----------------------------------------------------------------------
// | 公共函数：统一响应封装
// | 全站接口统一返回 { code, message, data }，code=0 表示成功
// +----------------------------------------------------------------------

use think\Response;

if (!function_exists('success')) {
    /**
     * 成功响应
     * @param mixed  $data 返回数据，默认 null
     * @param string $message 提示信息，成功固定 'ok'
     * @return Response
     */
    function success(mixed $data = null, string $message = 'ok'): Response
    {
        return json([
            'code'    => 0,
            'message' => $message,
            'data'    => $data,
        ]);
    }
}

if (!function_exists('http_status_of')) {
    /**
     * 业务错误码 → HTTP 状态码映射
     *
     * 目的：让 Nginx access log / WAF / 云监控能按状态码识别异常并设告警阈值，
     * 而不是所有失败都返回 200。前端 `services/api.ts` 只解析 JSON 体、不检查
     * `response.ok`，因此提高状态码不会造成前端回归。
     *
     * @param int $code 业务错误码
     * @return int HTTP 状态码
     */
    function http_status_of(int $code): int
    {
        return match ($code) {
            0       => 200, // 成功
            1001,   // 参数校验失败
            1007    => 400, // 原密码错误
            1002    => 409, // 重复提交
            1003,   // 未登录 / Token 无效
            1004    => 401, // 账号或密码错误
            1005    => 423, // 账号锁定
            1006    => 403, // 需先改初始密码
            1008    => 429, // 限流
            4004    => 404, // 资源不存在
            5000    => 500, // 服务器内部异常
            default => 400, // 未知业务码：保守按客户端错误处理
        };
    }
}

if (!function_exists('fail')) {
    /**
     * 失败响应
     * @param int    $code 业务错误码（见错误码表）
     * @param string $message 可直接展示的中文提示
     * @param mixed  $data 附加数据，默认 null
     * @return Response
     */
    function fail(int $code, string $message, mixed $data = null): Response
    {
        return json([
            'code'    => $code,
            'message' => $message,
            'data'    => $data,
        ], http_status_of($code));
    }
}

if (!function_exists('error_code')) {
    /**
     * 统一错误码常量（与前端 src/constants/index.ts 保持一致）
     *
     * 1001–1002 为原体系；1003–1008 为 CMS 后台增量新增；
     * 4004/5000 为原体系通用错误。
     *
     * @return array<string, int>
     */
    function error_code(): array
    {
        return [
            'SUCCESS'        => 0,    // 成功
            'VALIDATE_FAIL'  => 1001, // 参数校验失败
            'DUPLICATE'      => 1002, // 重复提交（幂等）
            'UNAUTHORIZED'   => 1003, // 未登录 / Token 无效或过期
            'LOGIN_FAILED'   => 1004, // 账号或密码错误（防枚举，不区分账号/密码）
            'ACCOUNT_LOCKED' => 1005, // 登录失败次数过多，账号/IP 已锁定
            'NEED_RESET_PWD' => 1006, // 需要先修改初始密码
            'OLD_PWD_WRONG'  => 1007, // 原密码错误
            'TOO_MANY_REQ'   => 1008, // 请求过于频繁（限流）
            'NOT_FOUND'      => 4004, // 资源不存在
            'SERVER_ERROR'   => 5000, // 服务器内部异常
        ];
    }
}

if (!function_exists('random_strong_password')) {
    /**
     * 生成随机强密码（大写 + 小写 + 数字 + 符号 **各至少一个**）
     *
     * 供 `cms:init` 创建初始管理员与后台「账号管理」新建账号 / 重置密码复用，
     * 保证「随机强密码」只有一处实现（安全逻辑不重复，避免两处规则漂移）。
     *
     * - 字符池剔除易混淆字符（I/O/l/o/0/1），便于人工抄录；
     * - 使用 `random_int()`（CSPRNG），禁止 `rand()` / `mt_rand()`；
     * - 生成后以 Fisher-Yates 打乱，避免各类字符位置固定。
     *
     * @param int $length 期望长度；小于 12 时按 12 处理（PRD 6.6：初始密码 ≥12）
     * @return string
     */
    function random_strong_password(int $length = 16): string
    {
        if ($length < 12) {
            $length = 12;
        }

        $upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';      // 去除易混淆 I/O
        $lower  = 'abcdefghijkmnpqrstuvwxyz';      // 去除易混淆 l/o
        $digit  = '23456789';                      // 去除易混淆 0/1
        $symbol = '!@#$%^&*()-_=+';

        // 每类先各保证 1 个
        $chars = [
            $upper[random_int(0, strlen($upper) - 1)],
            $lower[random_int(0, strlen($lower) - 1)],
            $digit[random_int(0, strlen($digit) - 1)],
            $symbol[random_int(0, strlen($symbol) - 1)],
        ];

        $pool    = $upper . $lower . $digit . $symbol;
        $poolLen = strlen($pool);

        for ($i = count($chars); $i < $length; $i++) {
            $chars[] = $pool[random_int(0, $poolLen - 1)];
        }

        // 打乱顺序（Fisher-Yates）
        for ($i = count($chars) - 1; $i > 0; $i--) {
            $j = random_int(0, $i);
            [$chars[$i], $chars[$j]] = [$chars[$j], $chars[$i]];
        }

        return implode('', $chars);
    }
}

if (!function_exists('cms_path')) {
    /**
     * 后台路径前缀（归一化）
     *
     * 读取 `config/cms.php` 的 `path`（对应 .env 的 `CMS_PATH`）：
     * - 去除首尾空白与斜杠，保证规范形式为 `/xxx`；
     * - **返回空串表示后台未启用**（此时后端不注册任何管理 API）。
     *
     * @return string 归一化后的前缀（如 `/manage-x7k2`）；未配置返回 ''
     */
    function cms_path(): string
    {
        $path = (string) config('cms.path', '');
        $path = trim($path);

        if ($path === '') {
            return '';
        }

        return '/' . trim($path, "/ \t\n\r\0\x0B");
    }
}
