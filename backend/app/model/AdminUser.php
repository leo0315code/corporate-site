<?php
declare(strict_types=1);

namespace app\model;

use think\Model;

/**
 * 后台管理员模型（对应 admin_user 表）
 *
 * 安全约定：
 * - `password_hash` 通过 `$hidden` 隐藏，`toArray()` / JSON 序列化**永不返回**哈希；
 * - 密码校验一律使用 `password_verify()`，禁止自定义加密；
 * - 任何日志/响应**不得**输出明文密码或哈希。
 *
 * @property int         $id
 * @property string      $username
 * @property string      $password_hash
 * @property int         $must_change_password
 * @property int         $status
 * @property int         $is_primary
 * @property string|null $last_login_at
 * @property string      $last_login_ip
 * @property string      $created_at
 * @property string      $updated_at
 */
class AdminUser extends Model
{
    /** 数据表名（不含前缀） */
    protected $name = 'admin_user';

    /** 主键 */
    protected $pk = 'id';

    /** 自动写入时间戳（datetime 类型） */
    protected $autoWriteTimestamp = 'datetime';
    protected $createTime = 'created_at';
    protected $updateTime = 'updated_at';

    /**
     * 计时侧信道用的哑元 bcrypt 哈希（**有意保留，勿删**）。
     *
     * 背景（CWE-208，可观测时间差异）：登录时若账号不存在就直接跳过密码校验，
     * 「不存在」分支会比「存在」分支少付出一次 `password_verify()` 的 bcrypt 成本，
     * 攻击者可据此推断账号是否有效。此处提供一个**合法的 cost=10 bcrypt 串**
     * （与 `password_hash(..., PASSWORD_BCRYPT)` 默认 cost 一致），
     * 供账号不存在时对该哑元哈希执行一次 `password_verify()`，使两路分支耗时对齐。
     *
     * 注意：该值必须是**预先算好的固定常量**（而非运行时 `password_hash()` 生成），
     * 否则首个请求会额外承担哈希生成成本，反而引入新的时间差。其明文无实际意义。
     */
    private const DUMMY_HASH = '$2y$10$HiSHKmu8U3czazCtIYhO6eAaR0ZdcvanvyLfQ4yXFuAiTbgRTG.6i';

    /**
     * 隐藏字段：密码哈希绝不出库
     * @var array<int, string>
     */
    protected $hidden = ['password_hash'];

    /**
     * 字段类型转换
     * @var array<string, string>
     */
    protected $type = [
        'id'                   => 'integer',
        'username'             => 'string',
        'must_change_password' => 'integer',
        'status'               => 'integer',
        'is_primary'           => 'integer',
        'last_login_ip'        => 'string',
    ];

    /**
     * 按用户名查询启用中的管理员
     * @param string $username 登录账号
     * @return AdminUser|null 命中且 status=1 返回模型，否则 null
     */
    public static function findActiveByUsername(string $username): ?AdminUser
    {
        /** @var AdminUser|null $user */
        $user = self::where('username', $username)
            ->where('status', 1)
            ->find();

        return $user instanceof AdminUser ? $user : null;
    }

    /**
     * 校验明文密码是否匹配（bcrypt `password_verify`）
     * @param string $plain 明文密码
     * @return bool
     */
    public function verifyPassword(string $plain): bool
    {
        $hash = (string) $this->getData('password_hash');

        if ($hash === '') {
            return false;
        }

        return password_verify($plain, $hash);
    }

    /**
     * 对固定哑元哈希执行一次 `password_verify()`（**计时均衡用，勿删**）。
     *
     * 供 `AuthService::login()` 在**账号不存在**分支调用，使「不存在」与「存在」两路
     * 恰好各执行一次同 cost 的 bcrypt 校验，消除可观测耗时差（CWE-208）。返回值无业务
     * 意义（恒为 false），调用方**必须丢弃**。
     *
     * @param string $plain 明文密码（仅用于触发等价计算）
     * @return void
     */
    public static function verifyDummy(string $plain): void
    {
        // 结果固定为 false，仅用于消耗与真实校验等价的 bcrypt 时间；显式丢弃返回值。
        password_verify($plain, self::DUMMY_HASH);
    }

    /**
     * 更新密码：写入新 bcrypt 哈希并解除「强制改密」标记
     *
     * 说明：`password_hash` 为隐藏字段，这里通过 `getData()` 读取原值再 set 覆盖，
     * 确保模型 `$data` 内始终保有哈希用于后续校验（不依赖 toArray）。
     *
     * @param string $plain 新明文密码
     * @return void
     */
    public function changePassword(string $plain): void
    {
        $this->set('password_hash', password_hash($plain, PASSWORD_BCRYPT));
        $this->set('must_change_password', 0);
        $this->save();
    }

    /**
     * 记录登录成功时间与来源 IP
     * @param string $ip 登录 IP
     * @return void
     */
    public function markLogin(string $ip): void
    {
        $this->last_login_at = date('Y-m-d H:i:s');
        $this->last_login_ip = mb_substr($ip, 0, 45);
        $this->save();
    }

    /**
     * 按用户名查询（**不区分 status**，供账号管理判重与定位禁用账号）
     *
     * 与 `findActiveByUsername()` 的差异：后者仅返回 status=1 的账号（登录用，
     * 禁用账号等同于不存在，避免泄露账号是否存在）；本方法用于后台账号管理，
     * 必须在建号时发现「已存在但被禁用」的账号，避免撞唯一索引 `uk_username`。
     *
     * @param string $username 登录账号
     * @return AdminUser|null
     */
    public static function findByUsername(string $username): ?AdminUser
    {
        /** @var AdminUser|null $user */
        $user = self::where('username', $username)->find();

        return $user instanceof AdminUser ? $user : null;
    }

    /**
     * 启用中的管理员数量
     *
     * 用途：账号管理需保证「至少保留 1 个启用账号」，否则后台将无人可登录。
     *
     * @return int
     */
    public static function countEnabled(): int
    {
        return (int) self::where('status', 1)->count();
    }

    /**
     * 是否为主账号
     *
     * 主账号 = `cms:init` 创建的初始管理员（或老库升级时回填的最早账号）。
     * 它**不带来额外权限**（管理员之间权限等同），只用于防止「初始管理员被
     * 误停用 / 误删除 / 恶意替换」——停用与删除由服务端统一拦截。
     *
     * @return bool
     */
    public function isPrimary(): bool
    {
        return (int) $this->getData('is_primary') === 1;
    }

    /**
     * 主账号数量（用于「至少保留一个主账号」类不变量校验）
     * @return int
     */
    public static function countPrimary(): int
    {
        return (int) self::where('is_primary', 1)->count();
    }

    /**
     * 将当前账号标记为主账号并落库
     *
     * 仅供 `cms:init` 创建初始管理员时使用；后台界面**不提供**该操作，
     * 避免出现「批量提权」或主账号被随意转移。
     *
     * @return void
     */
    public function markAsPrimary(): void
    {
        $this->set('is_primary', 1);
        $this->save();
    }

    /**
     * 设置启用 / 禁用状态并落库
     * @param int $status 1=启用 0=禁用
     * @return void
     */
    public function setStatus(int $status): void
    {
        $this->set('status', $status === 1 ? 1 : 0);
        $this->save();
    }

    /**
     * 重置密码：写入新 bcrypt 哈希并**重新置位强制改密标记**
     *
     * 与 `changePassword()` 的差异：后者用于「本人改密」，改密成功即解除
     * `must_change_password`；本方法用于管理员为**他人**重置密码，属于
     * 「代发初始密码」场景——对方必须先用初始密码登录、再被强制改为自己的密码，
     * 故此处固定 `must_change_password = 1`。
     *
     * @param string $plain 新的初始明文密码（仅用于生成哈希，不落库、不返回）
     * @return void
     */
    public function resetPasswordTo(string $plain): void
    {
        $this->set('password_hash', password_hash($plain, PASSWORD_BCRYPT));
        $this->set('must_change_password', 1);
        $this->save();
    }

    /**
     * 创建账号（随机初始密码由调用方生成并**一次性返回**）
     *
     * 约定：`must_change_password = 1`（首次登录强制改密）、`status = 1`（默认启用）、
     * `is_primary = 0`（**后台新建的账号一律为普通账号**；主账号只由 `cms:init` 产生）。
     *
     * @param string $username 登录账号
     * @param string $plain    初始明文密码
     * @return AdminUser 已落库的管理员
     */
    public static function createAccount(string $username, string $plain): AdminUser
    {
        /** @var AdminUser $user */
        $user = self::create([
            'username'             => $username,
            'password_hash'        => password_hash($plain, PASSWORD_BCRYPT),
            'must_change_password' => 1,
            'status'               => 1,
            'is_primary'           => 0,
        ]);

        return $user;
    }

    /**
     * 对外资料（永不含密码哈希，供 API 返回）
     *
     * 字段严格对齐前端 `AdminProfile`：
     * `{ id, username, must_change_password:boolean, status:number, last_login_at, last_login_ip }`
     *
     * @return array<string, mixed>
     */
    public function toProfile(): array
    {
        return [
            'id'                   => (int) $this->id,
            'username'             => (string) $this->username,
            'must_change_password' => (int) $this->must_change_password === 1,
            'status'               => (int) $this->status,
            'last_login_at'        => $this->last_login_at,
            'last_login_ip'        => (string) $this->last_login_ip,
        ];
    }

    /**
     * 账号管理列表项（永不含密码哈希）
     *
     * 字段严格对齐前端 `AdminListItem`：
     * `{ id, username, status, must_change_password, is_primary, last_login_at, last_login_ip, created_at }`
     *
     * 设计取舍：
     * - `must_change_password` 直出 **number**（0/1）而非 boolean —— 列表页需要区分
     *   「需改密 / 正常」两种标签，直接与 `status` 处理方式保持一致，避免前端再做转换；
     * - `is_primary` 同样直出 number（0/1），供前端打「主账号」标记并禁用停用/删除按钮；
     * - 显式返回 `created_at`（列表按创建时间倒序，便于识别新增账号）。
     *
     * @return array<string, mixed>
     */
    public function toAdminItem(): array
    {
        return [
            'id'                   => (int) $this->id,
            'username'             => (string) $this->username,
            'status'               => (int) $this->status,
            'must_change_password' => (int) $this->must_change_password,
            'is_primary'           => (int) $this->getData('is_primary'),
            'last_login_at'        => $this->last_login_at,
            'last_login_ip'        => (string) $this->last_login_ip,
            'created_at'           => (string) $this->created_at,
        ];
    }
}
