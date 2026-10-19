<?php
declare(strict_types=1);

namespace app\command;

use app\model\About;
use app\model\AdminUser;
use app\model\Advantage;
use app\model\CaseItem;
use app\model\News;
use app\model\Product;
use app\model\SiteConfig;
use app\validate\AdminValidate;
use think\console\Command;
use think\console\Input;
use think\console\input\Option;
use think\console\Output;

/**
 * CMS 初始化命令 `php think cms:init`
 *
 * 三步，**全部幂等**，可重复执行：
 *   1. 建表/迁移：读取 `database/cms.sql`，在**同一个 PDO 连接**上顺序执行全部语句
 *      （`SET @var` + `PREPARE/EXECUTE/DEALLOCATE` 必须同连接才生效）。
 *   2. 内容迁移：读取 `database/seed/cms-seed.json`，按主键 upsert 导入
 *      products(8) / news(7) / cases(6) / advantages(4) / about(1) / site(1)；advantage 无主键，
 *      采用「表非空则跳过」的幂等策略（二次执行不重复插入）。
 *   3. 管理员：`admin_user` 为空时创建初始管理员并打印账号名 + 随机强初始密码（仅此一次）；
 *      账号名**不再固定为 `admin`**（可用 `--username=` 指定，缺省随机生成），
 *      已存在管理员则跳过（不覆盖、不重置密码）。
 *
 * 安全：不修改/删除 `message` 既有数据；初始密码 ≥12 位（大写+小写+数字+符号）；
 *      `password_hash(PASSWORD_BCRYPT)` 落库；`must_change_password=1`。
 */
class CmsInit extends Command
{
    /** 初始密码长度（PRD 6.6：≥12） */
    protected const PWD_LENGTH = 16;

    /** 种子相对基线的秒偏移（保证日期不同的同时，created_at 均 <= now） */
    protected const SEED_TIME_OFFSET = 5;

    /**
     * 配置命令
     * @return void
     */
    protected function configure(): void
    {
        $this->setName('cms:init')
            ->addOption('username', 'u', Option::VALUE_OPTIONAL, '初始管理员账号名（缺省随机生成，不再固定为 admin）')
            ->addOption('password', 'p', Option::VALUE_OPTIONAL, '初始管理员密码（缺省随机强密码）')
            ->setDescription('初始化 CMS：建表 + 迁移内容种子 + 创建初始管理员（幂等）');
    }

    /**
     * 执行命令
     * @param Input  $input
     * @param Output $output
     * @return int 0=成功，1=失败
     */
    protected function execute(Input $input, Output $output): int
    {
        $output->writeln('<info>=== CMS 初始化开始 ===</info>');

        // 1) 建表 / 迁移
        try {
            $this->migrate($output);
        } catch (\Throwable $e) {
            $output->writeln('<error>[失败] 建表阶段中止：' . $e->getMessage() . '</error>');
            return 1;
        }

        // 2) 内容迁移
        try {
            $this->seed($output);
        } catch (\Throwable $e) {
            $output->writeln('<error>[失败] 内容迁移中止：' . $e->getMessage() . '</error>');
            return 1;
        }

        // 3) 管理员
        try {
            $this->ensureAdmin($input, $output);
        } catch (\Throwable $e) {
            $output->writeln('<error>[失败] 管理员初始化中止：' . $e->getMessage() . '</error>');
            return 1;
        }

        $output->writeln('<info>=== CMS 初始化完成 ===</info>');

        return 0;
    }

    /**
     * 步骤 1：执行建表 / 迁移脚本
     *
     * 关键：整个脚本必须在**同一个 PDO 连接**上顺序执行，否则
     * `SET @var` / `PREPARE` / `EXECUTE` / `DEALLOCATE` 会因换连接而失效。
     * 优先带库名连接；若库尚不存在则退化为无库名连接——脚本内的
     * `CREATE DATABASE IF NOT EXISTS` + `USE` 会补建并切换，保证可重复执行。
     *
     * 库名**以 `.env` 的 `DATABASE` 为准**：脚本内的 `CREATE DATABASE` / `USE` 会被
     * 就地改写为配置库名（见 `applyDatabaseName()`），避免换库部署时建到写死的
     * `corporate_site` 上、目标库始终没有表。
     *
     * @param Output $output
     * @return void
     * @throws \RuntimeException 脚本缺失、库名非法或某条语句执行失败
     */
    protected function migrate(Output $output): void
    {
        $sqlFile = $this->sqlPath();

        if (!is_file($sqlFile)) {
            throw new \RuntimeException('建表脚本不存在：' . $sqlFile);
        }

        $sql        = $this->applyDatabaseName((string) file_get_contents($sqlFile));
        $statements = $this->splitSql($sql);

        $output->writeln(sprintf(
            '<comment>[1/3] 建表/迁移：共 %d 条语句（目标库 %s）</comment>',
            count($statements),
            $this->configuredDatabase()
        ));

        $pdo = $this->createPdo();

        $ok = 0;
        foreach ($statements as $index => $statement) {
            try {
                // 用 query() 执行并**消费/关闭结果集**：
                // cms.sql 中 IF(...,'ALTER ...','SELECT 1') 的空操作分支会产生结果集，
                // 若不消费，后续语句将报 "unbuffered queries are active"(2014)。
                $stmt = $pdo->query($statement);
                if ($stmt instanceof \PDOStatement) {
                    $stmt->fetchAll();
                    $stmt->closeCursor();
                }
                $ok++;
            } catch (\Throwable $e) {
                $output->writeln('<error>第 ' . ($index + 1) . ' 条语句执行失败：</error>');
                $output->writeln($statement);
                throw new \RuntimeException($e->getMessage(), 0, $e);
            }
        }

        $output->writeln(sprintf('<info>      建表/迁移完成：%d/%d 条成功</info>', $ok, count($statements)));
    }

    /**
     * 读取 `.env` 中的目标库名（已做标识符合法性校验）
     *
     * @return string
     * @throws \RuntimeException 未配置或含非法字符
     */
    protected function configuredDatabase(): string
    {
        /** @var array<string, mixed> $conf */
        $conf = config('database.connections.mysql');
        $name = trim((string) ($conf['database'] ?? ''));

        if ($name === '') {
            throw new \RuntimeException('未配置数据库名：请检查 .env 的 [DATABASE] DATABASE');
        }

        // 库名会拼进 DDL，必须是纯标识符（不允许反引号/分号等）
        if (!preg_match('/^[A-Za-z0-9_]{1,64}$/', $name)) {
            throw new \RuntimeException('数据库名不合法（仅允许字母/数字/下划线，≤64 字符）：' . $name);
        }

        return $name;
    }

    /**
     * 把建表脚本里的库名改写为配置库名
     *
     * `database/cms.sql` 为避免「必须改文件才能执行」，保留了一份可直接手工执行的
     * 默认库名（`corporate_site`）；命令执行时则统一改写为 `.env` 里的实际库名。
     * 只改写 `CREATE DATABASE IF NOT EXISTS \`x\`` 与行首 `USE \`x\`` 两类语句，
     * 表名、字段、注释里的同名文本一律不动。
     *
     * @param string $sql 原始脚本
     * @return string 改写后的脚本
     * @throws \RuntimeException 库名非法
     */
    protected function applyDatabaseName(string $sql): string
    {
        $dbName = $this->configuredDatabase();

        $rewritten = preg_replace(
            [
                '/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+`[^`]+`/i',
                '/^USE\s+`[^`]+`/mi',
            ],
            [
                'CREATE DATABASE IF NOT EXISTS `' . $dbName . '`',
                'USE `' . $dbName . '`',
            ],
            $sql
        );

        // preg_replace 出错时返回 null（正则回溯上限等），此时宁可失败也不执行半成品脚本
        if ($rewritten === null) {
            throw new \RuntimeException('建表脚本文本改写失败：' . (preg_last_error_msg() ?: '未知原因'));
        }

        return $rewritten;
    }

    /**
     * 建立用于执行 SQL 脚本的 PDO 连接（读 .env 的 [DATABASE] 配置）
     *
     * @return \PDO
     * @throws \RuntimeException 连接失败
     */
    protected function createPdo(): \PDO
    {
        /** @var array<string, mixed> $conf */
        $conf = config('database.connections.mysql');

        $host    = (string) ($conf['hostname'] ?? '127.0.0.1');
        $port    = (string) ($conf['hostport'] ?? '3306');
        $dbName  = $this->configuredDatabase();
        $charset = (string) ($conf['charset'] ?? 'utf8mb4');
        $user    = (string) ($conf['username'] ?? 'root');
        $pass    = (string) ($conf['password'] ?? '');

        $options = [
            \PDO::ATTR_ERRMODE            => \PDO::ERRMODE_EXCEPTION,
            \PDO::ATTR_EMULATE_PREPARES   => false,
            \PDO::ATTR_DEFAULT_FETCH_MODE => \PDO::FETCH_ASSOC,
            // cms.sql 中 IF(...,'ALTER ...','SELECT 1') 的空操作分支会产出结果集，
            // 必须缓冲以避免后续语句报 "unbuffered queries are active"。
            \PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
        ];

        // 优先带库名连接
        try {
            return new \PDO(
                sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $host, $port, $dbName, $charset),
                $user,
                $pass,
                $options
            );
        } catch (\Throwable $e) {
            // 库可能尚不存在：退化为无库名连接，交由脚本内 CREATE DATABASE + USE 补建
            try {
                return new \PDO(
                    sprintf('mysql:host=%s;port=%s;charset=%s', $host, $port, $charset),
                    $user,
                    $pass,
                    $options
                );
            } catch (\Throwable $inner) {
                throw new \RuntimeException('数据库连接失败：' . $inner->getMessage(), 0, $inner);
            }
        }
    }

    /**
     * 步骤 2：内容种子迁移（幂等 upsert）
     *
     * @param Output $output
     * @return void
     * @throws \RuntimeException 种子文件缺失/解析失败
     */
    protected function seed(Output $output): void
    {
        $seedFile = $this->seedPath();

        if (!is_file($seedFile)) {
            throw new \RuntimeException('种子文件不存在：' . $seedFile);
        }

        $raw  = (string) file_get_contents($seedFile);
        $data = json_decode($raw, true);

        if (!is_array($data)) {
            throw new \RuntimeException('种子文件解析失败（JSON 非法）：' . $seedFile);
        }

        $output->writeln('<comment>[2/3] 内容迁移</comment>');

        $baseTs = time() - self::SEED_TIME_OFFSET;

        // ---- 产品（slug 主键 upsert）----
        $productCount = $this->upsertSlugList(
            Product::class,
            $data['products'] ?? [],
            $baseTs
        );
        $output->writeln(sprintf('<info>      产品 product：实际入库 %d 条</info>', $productCount));

        // ---- 新闻（slug 主键 upsert；date 为排序键）----
        $newsCount = $this->upsertSlugList(
            News::class,
            $data['news'] ?? [],
            $baseTs
        );
        $output->writeln(sprintf('<info>      新闻 news：实际入库 %d 条</info>', $newsCount));

        // ---- 案例（slug 主键 upsert）----
        $caseCount = $this->upsertSlugList(
            CaseItem::class,
            $data['cases'] ?? [],
            $baseTs
        );
        $output->writeln(sprintf('<info>      案例 case_item：实际入库 %d 条</info>', $caseCount));

        // ---- 优势（无业务主键：非空则跳过，为空则按顺序插入，sort_order=索引）----
        $advRows  = $data['advantages'] ?? [];
        $advExist = Advantage::count();
        if ($advExist > 0) {
            $output->writeln(sprintf('<info>      优势 advantage：表非空（%d 条），跳过导入</info>', $advExist));
            $advantageCount = (int) $advExist;
        } else {
            foreach (array_values($advRows) as $order => $row) {
                $row             = is_array($row) ? $row : [];
                $createAt        = date('Y-m-d H:i:s', $baseTs - $order);
                Advantage::create([
                    'value'      => (string) ($row['value'] ?? ''),
                    'label'      => (string) ($row['label'] ?? ''),
                    'desc'       => (string) ($row['desc'] ?? ''),
                    'sort_order' => (int) $order,
                    'created_at' => $createAt,
                    'updated_at' => $createAt,
                ]);
            }
            $advantageCount = (int) Advantage::count();
            $output->writeln(sprintf('<info>      优势 advantage：实际入库 %d 条</info>', $advantageCount));
        }

        // ---- 关于我们（单例 id=1 upsert）----
        $aboutRaw = is_array($data['about'] ?? null) ? $data['about'] : [];
        $about = [
            'id'        => About::SINGLETON_ID,
            'intro'     => (string) ($aboutRaw['intro'] ?? ''),
            'vision'    => (string) ($aboutRaw['vision'] ?? ''),
            'mission'   => (string) ($aboutRaw['mission'] ?? ''),
            'values'    => is_array($aboutRaw['values'] ?? null) ? $aboutRaw['values'] : [],
            'timeline'  => is_array($aboutRaw['timeline'] ?? null) ? $aboutRaw['timeline'] : [],
            'abilities' => is_array($aboutRaw['abilities'] ?? null) ? $aboutRaw['abilities'] : [],
        ];

        $this->upsertByKey(About::class, ['id' => About::SINGLETON_ID], $about);
        $output->writeln(sprintf('<info>      关于我们 about：实际入库 %d 条</info>', About::count()));

        // ---- 网站配置（单例 id=1 upsert；嵌套 camelCase → 扁平 snake_case）----
        $siteRaw = is_array($data['site'] ?? null) ? $data['site'] : [];
        $this->upsertByKey(
            SiteConfig::class,
            ['id' => SiteConfig::SINGLETON_ID],
            $this->flattenSiteConfig($siteRaw)
        );
        $output->writeln(sprintf('<info>      网站配置 site_config：实际入库 %d 条</info>', SiteConfig::count()));

        $output->writeln(sprintf(
            '<info>      内容迁移完成：product=%d news=%d case=%d advantage=%d about=%d site=%d</info>',
            $productCount,
            $newsCount,
            $caseCount,
            $advantageCount,
            About::count(),
            SiteConfig::count()
        ));
    }

    /**
     * 网站配置：嵌套 camelCase（种子/接口契约）→ 扁平 snake_case（表字段）
     *
     * 白名单式转换，`nav` / `theme` / `footer.quickLinks` 等不在表内，直接丢弃。
     *
     * @param array<string, mixed> $raw 种子 site 块
     * @return array<string, mixed>
     */
    protected function flattenSiteConfig(array $raw): array
    {
        $contact = is_array($raw['contact'] ?? null) ? $raw['contact'] : [];
        $footer  = is_array($raw['footer'] ?? null) ? $raw['footer'] : [];
        $seo     = is_array($raw['seo'] ?? null) ? $raw['seo'] : [];

        $str = static function (mixed $value): string {
            return is_scalar($value) ? trim((string) $value) : '';
        };

        $socials = [];
        foreach (is_array($footer['socials'] ?? null) ? $footer['socials'] : [] as $item) {
            if (!is_array($item)) {
                continue;
            }
            $label = $str($item['label'] ?? '');
            if ($label === '') {
                continue;
            }
            $socials[] = [
                'label' => $label,
                'url'   => $str($item['url'] ?? ''),
                'icon'  => $str($item['icon'] ?? ''),
            ];
        }

        return [
            'company_name' => $str($raw['companyName'] ?? ''),
            'logo'         => $str($raw['logo'] ?? ''),
            'slogan'       => $str($raw['slogan'] ?? ''),
            'description'  => $str($raw['description'] ?? ''),
            'phone'        => $str($contact['phone'] ?? ''),
            'email'        => $str($contact['email'] ?? ''),
            'address'      => $str($contact['address'] ?? ''),
            'work_time'    => $str($contact['workTime'] ?? ''),
            'map_image'    => $str($contact['mapImage'] ?? ''),
            'copyright'    => $str($footer['copyright'] ?? ''),
            'icp'          => $str($footer['icp'] ?? ''),
            'socials'      => $socials,
            'seo_title'    => $str($seo['title'] ?? ''),
            'seo_desc'     => $str($seo['description'] ?? ''),
            'seo_keywords' => $str($seo['keywords'] ?? ''),
        ];
    }

    /**
     * 按 slug 主键 upsert 一组记录（存在 update、不存在 insert）
     *
     * @param class-string   $modelClass 模型类名
     * @param array<int, mixed> $rows     种子行
     * @param int            $baseTs     时间基线（用于 created_at 有序落库）
     * @return int 实际入库（表内）条数
     */
    protected function upsertSlugList(string $modelClass, array $rows, int $baseTs): int
    {
        foreach (array_values($rows) as $order => $row) {
            if (!is_array($row) || !isset($row['id']) || (string) $row['id'] === '') {
                continue;
            }

            $id = (string) $row['id'];

            // 保留种子中显式生产的业务字段；created_at 有序写入以保持源顺序
            $payload = $row;
            unset($payload['created_at'], $payload['updated_at']);
            // created_at 递减，使 index 0 最新（列表 created_at desc 即源顺序）
            $payload['created_at'] = date('Y-m-d H:i:s', $baseTs - $order);

            $this->upsertByKey($modelClass, ['id' => $id], $payload);
        }

        return (int) $modelClass::count();
    }

    /**
     * 通用 upsert：按给定键查找，命中则更新、否则创建
     *
     * （TP8 自带 ORM 无 `updateOrCreate`，此处显式实现，语义等价且可读。）
     *
     * @param class-string               $modelClass 模型类名
     * @param array<string, mixed>       $where      定位条件
     * @param array<string, mixed>       $data       写入数据
     * @return void
     */
    protected function upsertByKey(string $modelClass, array $where, array $data): void
    {
        $query = $modelClass::query();
        foreach ($where as $field => $value) {
            $query->where($field, $value);
        }

        /** @var \think\Model|null $exists */
        $exists = $query->find();

        if ($exists instanceof \think\Model) {
            $exists->save($data);
            return;
        }

        // 新增：合并定位键
        $modelClass::create(array_merge($where, $data));
    }

    /**
     * 步骤 3：确保存在管理员
     *
     * 首次创建的管理员会被标记为**主账号**（`is_primary = 1`）：
     * - 语义：它是系统最初的入口账号，**不得被停用或删除**（服务端强制，见 `AdminService`），
     *   避免后续新建的管理员把初始账号误删 / 恶意停用后接管系统；
     * - 角色：`admin`（超级管理员）；
     * - 幂等：库中一旦已有管理员则整体跳过，不会改动既有账号的 `is_primary` 标记。
     *
     * 账号名**不再固定为 `admin`**：可用 `--username=` 显式指定，缺省随机生成
     * （`cms_` + 8 位），避免「入口路径 + 账号名」双固定后被定向爆破。
     *
     * @param Input  $input
     * @param Output $output
     * @return void
     */
    protected function ensureAdmin(Input $input, Output $output): void
    {
        $output->writeln('<comment>[3/3] 管理员账号</comment>');

        $count = AdminUser::count();
        if ($count > 0) {
            $output->writeln(sprintf(
                '<info>      已存在管理员（%d 个），跳过创建（如需新增请用后台「账号管理」）</info>',
                $count
            ));

            return;
        }

        $username    = $this->resolveUsername($input);
        $password    = $this->resolvePassword($input);
        $isGenerated = trim((string) $input->getOption('password')) === '';

        /** @var AdminUser $user */
        $user = AdminUser::create([
            'username'             => $username,
            'password_hash'        => password_hash($password, PASSWORD_BCRYPT),
            'must_change_password' => 1,
            'status'               => 1,
            'is_primary'           => 1,
            'role'                 => 'admin',
        ]);

        // 双保险：即使上面因模型字段过滤未写入 is_primary，也确保主账号标记落库
        if (!$user->isPrimary()) {
            $user->markAsPrimary();
        }

        $output->writeln('');
        $output->writeln('<info>====================================================</info>');
        $output->writeln('<info>  已创建初始管理员（凭据仅本次打印，请立即妥善保存）</info>');
        $output->writeln('<info>----------------------------------------------------</info>');
        $output->writeln('<info>  账号：' . $username . '</info>');
        $output->writeln('<info>  ' . ($isGenerated ? '初始密码' : '指定密码') . '：' . $password . '</info>');
        $output->writeln('<info>  说明：首次登录将强制修改密码（must_change_password=1）</info>');
        $output->writeln('<info>        该账号为主账号，后台不可停用 / 删除</info>');
        $output->writeln('<info>====================================================</info>');
        $output->writeln('');
    }

    /**
     * 解析初始管理员账号名
     *
     * 优先级：`--username=` > 随机生成（`cms_` + 8 位）。
     * 显式指定时沿用 `AdminValidate` 的 `adminCreate` 规则（3~50 位、字母开头），
     * 保证「命令行建的账号」与「后台建的账号」格式完全一致。
     *
     * @param Input $input
     * @return string 合法账号名
     * @throws \RuntimeException 显式指定的账号名不合规
     */
    protected function resolveUsername(Input $input): string
    {
        $username = trim((string) $input->getOption('username'));

        if ($username === '') {
            return random_admin_username();
        }

        $validate = new AdminValidate();
        if (!$validate->scene('adminCreate')->check(['username' => $username])) {
            throw new \RuntimeException('账号名不合法：' . $validate->getError());
        }

        return $username;
    }

    /**
     * 解析初始管理员密码
     *
     * 优先级：`--password=` > 随机强密码。显式指定的密码同样要通过强度校验
     * （≥12 位且含大写+小写+数字+符号），不允许把弱口令带进生产。
     *
     * @param Input $input
     * @return string 通过强度校验的密码
     * @throws \RuntimeException 显式指定的密码过弱
     */
    protected function resolvePassword(Input $input): string
    {
        $password = (string) $input->getOption('password');

        if ($password === '') {
            return $this->generatePassword(self::PWD_LENGTH);
        }

        $error = password_policy_error($password);
        if ($error !== null) {
            throw new \RuntimeException('密码强度不足：' . $error);
        }

        return $password;
    }

    /**
     * 生成随机强密码：保证同时含大写、小写、数字、符号
     *
     * 实现已统一收敛到全局助手 `random_strong_password()`（见 `app/common.php`），
     * 供本命令与后台「账号管理」（新建账号 / 重置密码）复用，避免两处安全逻辑漂移。
     *
     * @param int $length 密码长度（≥12）
     * @return string
     */
    protected function generatePassword(int $length): string
    {
        return random_strong_password($length);
    }

    /**
     * 将 SQL 脚本切分为单条语句（跳过空行与 `--` 注释行）
     *
     * @param string $sql 原始脚本
     * @return string[] 语句数组
     */
    protected function splitSql(string $sql): array
    {
        $lines = preg_split('/\r\n|\r|\n/', $sql) ?: [];

        // 逐行剔除仅含注释或空白的行
        $clean = [];
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || str_starts_with($trimmed, '--')) {
                continue;
            }
            $clean[] = $line;
        }

        $joined = implode("\n", $clean);

        $statements = [];
        foreach (explode(';', $joined) as $part) {
            $part = trim($part);
            if ($part !== '') {
                $statements[] = $part;
            }
        }

        return $statements;
    }

    /**
     * 建表脚本路径
     * @return string
     */
    protected function sqlPath(): string
    {
        return $this->app->getRootPath() . 'database' . DIRECTORY_SEPARATOR . 'cms.sql';
    }

    /**
     * 种子文件路径
     * @return string
     */
    protected function seedPath(): string
    {
        return $this->app->getRootPath() . 'database' . DIRECTORY_SEPARATOR . 'seed' . DIRECTORY_SEPARATOR . 'cms-seed.json';
    }
}
