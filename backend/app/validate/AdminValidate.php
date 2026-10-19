<?php
declare(strict_types=1);

namespace app\validate;

use think\Validate;

/**
 * 后台账号管理验证器（列表 / 新建 / 启停 / 重置密码 / 删除）
 *
 * 场景：
 * - `adminCreate`       ：username（3~50，字母开头，仅字母数字下划线破折号）；
 * - `adminToggleStatus` ：id + status（0|1）；
 * - `adminResetPassword`：id；
 * - `adminDelete`       ：id + username（用户名二次确认，**精确性由 Service 比对真实记录裁决**）。
 *
 * 说明（职责边界）：
 * - 本验证器只裁决「格式与必填」；
 * - 「账号是否已存在」「是否停用自己」「是否删光管理员」等**依赖数据库状态**的判定
 *   一律交由 `AdminService` 在事务内完成，避免校验器直接访问库。
 *
 * 与 AuthValidate 的区别：AuthValidate 面向「本人认证」（登录 / 改密）；
 * 本验证器面向「管理员对他人的账号管理」，两者规则与场景不同，故分列而不合并。
 */
class AdminValidate extends Validate
{
    /**
     * 校验规则
     * @var array<string, string>
     */
    protected $rule = [
        'id'               => 'require|integer|gt:0',
        'username'         => 'require|length:3,50|checkUsername',
        'confirm_username' => 'require|length:1,50',
        'status'           => 'require|in:0,1',
    ];

    /**
     * 错误提示
     * @var array<string, string>
     */
    protected $message = [
        'id.require'                 => '缺少账号 ID',
        'id.integer'                 => '账号 ID 不合法',
        'id.gt'                      => '账号 ID 不合法',
        'username.require'           => '请输入账号',
        'username.length'            => '账号长度需为 3~50 个字符',
        'username.checkUsername'     => '账号需以字母开头，仅可包含字母、数字、下划线或短横线',
        'confirm_username.require'   => '请输入要删除的账号名以确认',
        'confirm_username.length'    => '账号名长度不合法',
        'status.require'             => '缺少目标状态',
        'status.in'                  => '目标状态不合法',
    ];

    /**
     * 校验场景
     *
     * 约定：删除接口的确认字段在校验器内名为 `confirm_username`，而**接口契约**中的
     * 请求字段名仍为 `username`（前端输入的就是账号名），由控制器负责改名映射。
     * 如此可让「新建」对 `username` 施加格式规则、而「删除」只要求非空与限长——
     * 若两者共用 `username`，则「删除一个转瞬即逝的 ID」会先被账号名格式规则拦成 1001，
     * 掩盖了更准确的 4004（资源不存在）；且确认串是否匹配由 Service 的 `hash_equals` 裁决，
     * 此处再校验格式并无额外防线。
     *
     * @var array<string, string[]>
     */
    protected $scene = [
        'adminCreate'        => ['username'],
        'adminToggleStatus'  => ['id', 'status'],
        'adminResetPassword' => ['id'],
        'adminDelete'        => ['id', 'confirm_username'],
    ];

    /**
     * 强制校验字段：即使值为空字符串也执行对应规则
     *
     * 背景（与 AuthValidate / MessageValidate 一致）：TP8 的 `checkItem()` 对空字符串会跳过
     * 非 require 的自定义规则。`status` 取值为 0 时既非 null 也非空串，本不必列入；
     * 但空串传入需被 `in:0,1` 拦下（而非被跳过），故列入 $must。
     * @var array<int, string>
     */
    protected $must = ['status'];

    /**
     * 账号名格式校验
     *
     * 规则：**以字母开头**，随后仅允许 字母 / 数字 / 下划线 / 短横线，总长 3~50。
     *
     * 为何要求字母开头（而非直接使用内置 alphaDash）：纯数字或 `_` 开头的账号
     * 在日志、URL、命令行提示中易与 ID、路径片段混淆；限定字母开头可消除歧义。
     * 长度区间已由 `length:3,50` 覆盖，此处只裁决字符集与首字符。
     *
     * @param mixed $value 账号
     * @param mixed $rule 规则参数（未使用）
     * @param array $data 全部数据（未使用）
     * @return bool
     */
    protected function checkUsername(mixed $value, mixed $rule = '', array $data = []): bool
    {
        return preg_match('/^[A-Za-z][A-Za-z0-9_-]{2,49}$/', (string) $value) === 1;
    }
}
