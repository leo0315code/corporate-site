<?php
declare(strict_types=1);

namespace app\validate;

use think\Validate;

/**
 * 留言验证器（服务端最终裁决）
 *
 * 字段规则（与前端 src/utils/validate.ts 完全一致）：
 * - name    ：必填，长度 2~30
 * - company ：选填，长度 <= 50
 * - phone   ：条件必填，手机或座机格式；与 email 至少填一项
 * - email   ：条件必填，邮箱格式；与 phone 至少填一项
 * - content ：必填，长度 5~500
 */
class MessageValidate extends Validate
{
    /**
     * 校验规则
     * @var array<string, string>
     */
    protected $rule = [
        'name'    => 'require|length:2,30',
        'company' => 'max:50',
        'phone'   => 'checkPhone',
        'email'   => 'checkEmail',
        'content' => 'require|length:5,500',
    ];

    /**
     * 错误提示
     * @var array<string, string>
     */
    protected $message = [
        'name.require'    => '此项为必填',
        'name.length'     => '姓名需为 2~30 个字符',
        'company.max'     => '公司名称不得超过 50 个字符',
        'phone.checkPhone' => '请填写正确的电话号码',
        'email.checkEmail' => '请填写正确的邮箱',
        'content.require' => '此项为必填',
        'content.length'  => '留言内容需为 5~500 个字符',
    ];

    /**
     * 校验场景
     * @var array<string, string[]>
     */
    protected $scene = [
        'submit' => ['name', 'company', 'phone', 'email', 'content'],
        'list'   => ['page', 'size'],
    ];

    /**
     * 强制校验字段（即使值为空字符串也执行对应规则）
     *
     * 背景：TP8 的 Validate::checkItem() 对「空字符串」会跳过非 require/must 的自定义规则。
     * phone / email 的「至少填一项」是跨字段自定义规则，若二者同时为空且未被强制校验，
     * 规则会被跳过 → 非法数据入库。将二者列入 $must 可确保空值时仍执行 checkPhone/checkEmail，
     * 从而正确拦截「电话与邮箱同时为空」的提交。
     * @var array<int, string>
     */
    protected $must = ['phone', 'email'];

    /**
     * 电话校验（支持手机与座机）
     * 规则：( phone 与 email ) 至少填一项；若填了 phone 则必须格式正确
     * @param mixed $value 电话
     * @param mixed $rule 规则参数（未使用）
     * @param array $data 全部数据（用于跨字段校验 email）
     * @return bool
     */
    protected function checkPhone(mixed $value, mixed $rule = '', array $data = []): bool
    {
        $phone = trim((string) $value);
        $email = trim((string) ($data['email'] ?? ''));

        if ($phone === '') {
            // 电话为空时，邮箱必须非空（至少填一项）
            return $email !== '';
        }

        // 手机号：1 开头，第二位 3-9，共 11 位
        $isMobile = preg_match('/^1[3-9]\d{9}$/', $phone) === 1;
        // 座机：区号 0 开头 2-3 位，可选连字符，7-8 位号码
        $isTel = preg_match('/^0\d{2,3}-?\d{7,8}$/', $phone) === 1;

        return $isMobile || $isTel;
    }

    /**
     * 邮箱校验
     * 规则：( email 与 phone ) 至少填一项；若填了 email 则必须格式正确
     * @param mixed $value 邮箱
     * @param mixed $rule 规则参数（未使用）
     * @param array $data 全部数据（用于跨字段校验 phone）
     * @return bool
     */
    protected function checkEmail(mixed $value, mixed $rule = '', array $data = []): bool
    {
        $email = trim((string) $value);
        $phone = trim((string) ($data['phone'] ?? ''));

        if ($email === '') {
            // 邮箱为空时，电话必须非空（至少填一项）
            return $phone !== '';
        }

        return preg_match('/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/', $email) === 1;
    }
}
