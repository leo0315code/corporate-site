<?php
declare(strict_types=1);

namespace app\validate;

use think\Validate;

/**
 * 认证验证器（登录 / 改密 / 强制改密）
 *
 * 场景：
 * - `login`           ：username、password 必填并限长；
 * - `changePassword`  ：old_password + new_password（8~72）+ confirm_password（与新密码一致）；
 * - `resetPassword`   ：new_password（8~72）+ confirm_password（与新密码一致）。
 *
 * 说明：密码「强度」（含字母+数字、不得与账号名相同）在 AuthService 内二次裁决，
 * 因为需要与账号名做跨字段比对；本验证器负责长度与「两次输入一致」。
 * 统一使用 snake_case 字段名（与后端约定一致；控制器会把 camelCase 输入归一化后传入）。
 */
class AuthValidate extends Validate
{
    /**
     * 校验规则
     * @var array<string, string>
     */
    protected $rule = [
        'username'         => 'require|length:1,50',
        'password'         => 'require|length:1,72',
        'old_password'     => 'require|length:1,72',
        'new_password'     => 'require|length:8,72',
        'confirm_password' => 'require|checkConfirm',
    ];

    /**
     * 错误提示
     * @var array<string, string>
     */
    protected $message = [
        'username.require'         => '请输入账号',
        'username.length'          => '账号长度需为 1~50 个字符',
        'password.require'         => '请输入密码',
        'password.length'          => '密码长度需为 1~72 个字符',
        'old_password.require'     => '请输入原密码',
        'old_password.length'      => '原密码长度不合法',
        'new_password.require'     => '请输入新密码',
        'new_password.length'      => '新密码长度需为 8~72 个字符',
        'confirm_password.require' => '请再次输入新密码',
        'confirm_password.checkConfirm' => '两次输入的新密码不一致',
    ];

    /**
     * 校验场景
     * @var array<string, string[]>
     */
    protected $scene = [
        'login'          => ['username', 'password'],
        'changePassword' => ['old_password', 'new_password', 'confirm_password'],
        'resetPassword'  => ['new_password', 'confirm_password'],
    ];

    /**
     * 强制校验字段：即使值为空字符串也执行规则
     *
     * 背景（与 MessageValidate 一致）：TP8 对空字符串会跳过非 require 的自定义规则，
     * 将 confirm_password 列入 $must 以确保空值时仍执行「一致性」判定。
     * @var array<int, string>
     */
    protected $must = ['confirm_password'];

    /**
     * 两次输入密码一致性校验
     * @param mixed $value 确认密码
     * @param mixed $rule 规则参数（未使用）
     * @param array $data 全部数据（用于取 new_password）
     * @return bool
     */
    protected function checkConfirm(mixed $value, mixed $rule = '', array $data = []): bool
    {
        $confirm = (string) $value;
        $new     = (string) ($data['new_password'] ?? '');

        // 二者均为空时交由 require 处理，此处仅校验「非空但不一致」
        if ($confirm === '') {
            return true;
        }

        return hash_equals($new, $confirm);
    }
}
