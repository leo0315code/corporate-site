-- ============================================================
-- CMS 增量建表脚本（MySQL 8 / utf8mb4）
-- 位置：backend/database/cms.sql
-- 幂等：建表一律 CREATE TABLE IF NOT EXISTS；
--       message 加列用 information_schema 判断列/索引是否存在，可重复执行。
-- 执行：① 推荐 `php think cms:init`（库名自动取 .env 的 DATABASE，下面两处会被改写）
--       ② 手工执行 `mysql -uroot -proot < backend/database/cms.sql`
--          —— 此时用的是下面写死的默认库名，换库请自行改这两行
-- 说明：本脚本不修改/删除 message 既有数据，仅新增列与索引。
-- ============================================================

-- 默认库名（`cms:init` 执行时会按 .env 的 [DATABASE] DATABASE 自动改写这两处）
CREATE DATABASE IF NOT EXISTS `corporate_site`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `corporate_site`;

-- ---------- 1) 管理员账号 ----------
CREATE TABLE IF NOT EXISTS `admin_user` (
  `id`                   INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '管理员 ID',
  `username`             VARCHAR(50)  NOT NULL DEFAULT ''       COMMENT '登录账号',
  `password_hash`        VARCHAR(255) NOT NULL DEFAULT ''       COMMENT '密码哈希（password_hash/bcrypt，只写不读）',
  `must_change_password` TINYINT(1)   NOT NULL DEFAULT 1        COMMENT '1=需强制修改初始密码',
  `status`               TINYINT      NOT NULL DEFAULT 1        COMMENT '1=启用 0=禁用',
  `is_primary`           TINYINT(1)   NOT NULL DEFAULT 0        COMMENT '1=主账号（不可停用/删除，由 cms:init 创建或回填）',
  `role`                 VARCHAR(20)  NOT NULL DEFAULT 'viewer' COMMENT 'RBAC 角色：admin / editor / viewer',
  `last_login_at`        DATETIME     NULL DEFAULT NULL         COMMENT '最近登录时间',
  `last_login_ip`        VARCHAR(45)  NOT NULL DEFAULT ''       COMMENT '最近登录 IP',
  `created_at`           DATETIME     NOT NULL,
  `updated_at`           DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='后台管理员';

-- admin_user 主账号标记（幂等：先查 information_schema，再按需 ALTER）
-- 语义：`is_primary = 1` 的账号为「主账号」，用于防止初始管理员被误删/恶意替换——
--       任何管理员都**不得停用或删除**主账号（服务端裁决，见 AdminService）。
--       该标记**不带来额外权限**（管理员之间权限仍完全等同），只作为一道护栏。
SET @db_name = DATABASE();
SET @admin_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'admin_user');
SET @primary_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'admin_user' AND COLUMN_NAME = 'is_primary');
SET @sql_primary = IF(@admin_exists = 1 AND @primary_exists = 0, 'ALTER TABLE `admin_user` ADD COLUMN `is_primary` TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=主账号（不可停用/删除）'' AFTER `status`', 'SELECT 1');
PREPARE stmt_primary FROM @sql_primary;
EXECUTE stmt_primary;
DEALLOCATE PREPARE stmt_primary;

-- 回填：库中若尚无主账号，把**最早创建**的管理员标记为主账号（幂等：已有主账号则跳过）
-- 说明：老库升级时不一定保留了 cms:init 创建的那个 admin（可能已被改名/删除），
--       故以「id 最小 = 最早创建」作为初始管理员的等价判定。
SET @has_primary = (SELECT COUNT(*) FROM `admin_user` WHERE `is_primary` = 1);
SET @sql_backfill = IF(@has_primary = 0, 'UPDATE `admin_user` SET `is_primary` = 1 ORDER BY `id` ASC LIMIT 1', 'SELECT 1');
PREPARE stmt_backfill FROM @sql_backfill;
EXECUTE stmt_backfill;
DEALLOCATE PREPARE stmt_backfill;

-- admin_user 角色列（幂等）：RBAC 固定三角色 admin / editor / viewer
-- 老库升级：新增列默认 'viewer'（最小权限），随后把**既有账号统一回填为 admin**，
-- 保证升级后原管理员的权限不缩水；新账号由后台显式指定角色。
SET @role_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'admin_user' AND COLUMN_NAME = 'role');
SET @sql_role = IF(@admin_exists = 1 AND @role_exists = 0, 'ALTER TABLE `admin_user` ADD COLUMN `role` VARCHAR(20) NOT NULL DEFAULT ''viewer'' COMMENT ''RBAC 角色：admin / editor / viewer'' AFTER `is_primary`', 'SELECT 1');
PREPARE stmt_role FROM @sql_role;
EXECUTE stmt_role;
DEALLOCATE PREPARE stmt_role;

-- 回填：**本次刚加列**时把既有账号统一升为 admin（升级前没有角色概念，原有管理员应保持全权）
-- 幂等：列已存在（@role_exists=1）则完全跳过，不会覆盖后续人工调整的角色
SET @sql_role_backfill = IF(@role_exists = 0, 'UPDATE `admin_user` SET `role` = ''admin''', 'SELECT 1');
PREPARE stmt_role_backfill FROM @sql_role_backfill;
EXECUTE stmt_role_backfill;
DEALLOCATE PREPARE stmt_role_backfill;

-- ---------- 2) 会话 Token ----------
CREATE TABLE IF NOT EXISTS `admin_session` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '会话 ID',
  `admin_id`   INT UNSIGNED NOT NULL                 COMMENT '管理员 ID',
  `token`      CHAR(64)     NOT NULL DEFAULT ''       COMMENT '会话 Token（64 位十六进制）',
  `expires_at` DATETIME     NOT NULL                  COMMENT '过期时间（签发 +2h）',
  `ip`         VARCHAR(45)  NOT NULL DEFAULT ''       COMMENT '签发 IP',
  `user_agent` VARCHAR(255) NOT NULL DEFAULT ''       COMMENT '签发 UA',
  `created_at` DATETIME     NOT NULL,
  `updated_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_token` (`token`),
  KEY `idx_admin` (`admin_id`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='后台会话 Token';

-- ---------- 3) 登录失败计数 / 锁定（账号 + IP 双维度） ----------
CREATE TABLE IF NOT EXISTS `login_attempt` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '计数 ID',
  `scope`          VARCHAR(10)  NOT NULL DEFAULT ''       COMMENT '维度：account | ip',
  `scope_key`      VARCHAR(100) NOT NULL DEFAULT ''       COMMENT '维度值：账号名 或 IP',
  `fail_count`     INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '连续失败次数',
  `locked_until`   DATETIME     NULL DEFAULT NULL         COMMENT '锁定截止时间（NULL=未锁定）',
  `last_failed_at` DATETIME     NULL DEFAULT NULL         COMMENT '最近一次失败时间',
  `created_at`     DATETIME     NOT NULL,
  `updated_at`     DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_scope_key` (`scope`, `scope_key`),
  KEY `idx_locked` (`locked_until`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='登录失败计数与锁定';

-- ---------- 4) 产品 / 服务 ----------
CREATE TABLE IF NOT EXISTS `product` (
  `id`          VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '业务唯一标识（前端 slug）',
  `category`    VARCHAR(30)  NOT NULL DEFAULT '' COMMENT '分类（用于筛选）',
  `name`        VARCHAR(60)  NOT NULL DEFAULT '' COMMENT '名称（≤60）',
  `summary`     VARCHAR(200) NOT NULL DEFAULT '' COMMENT '简介（≤200）',
  `description` TEXT                             COMMENT '详情（不限）',
  `features`    JSON         NULL                COMMENT '特点列表 string[]',
  `image`       VARCHAR(255) NOT NULL DEFAULT '' COMMENT '图片路径',
  `icon`        VARCHAR(30)  NOT NULL DEFAULT '' COMMENT '图标标识',
  `created_at`  DATETIME     NOT NULL,
  `updated_at`  DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_category` (`category`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='产品/服务';

-- ---------- 5) 新闻 ----------
CREATE TABLE IF NOT EXISTS `news` (
  `id`         VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '业务唯一标识（前端 slug）',
  `title`      VARCHAR(100) NOT NULL DEFAULT '' COMMENT '标题（≤100）',
  `date`       DATE         NOT NULL              COMMENT '日期 YYYY-MM-DD（排序键）',
  `category`   VARCHAR(30)  NOT NULL DEFAULT '' COMMENT '分类',
  `cover`      VARCHAR(255) NOT NULL DEFAULT '' COMMENT '封面路径',
  `summary`    VARCHAR(300) NOT NULL DEFAULT '' COMMENT '摘要（≤300）',
  `content`    TEXT                             COMMENT '正文（保留 \n 分段，P1 转富文本）',
  `created_at` DATETIME     NOT NULL,
  `updated_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_date` (`date`),
  KEY `idx_category` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='新闻';

-- ---------- 6) 客户案例（表名用 case_item，避 MySQL 保留字 CASE） ----------
CREATE TABLE IF NOT EXISTS `case_item` (
  `id`         VARCHAR(80)  NOT NULL DEFAULT '' COMMENT '业务唯一标识（前端 slug）',
  `name`       VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '客户名称（≤50）',
  `logo`       VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Logo 路径',
  `desc`       VARCHAR(200) NOT NULL DEFAULT '' COMMENT '描述（≤200）',
  `created_at` DATETIME     NOT NULL,
  `updated_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='客户案例';

-- ---------- 7) 优势（前端 Advantage 无 id，用自增主键作后台操作标识） ----------
CREATE TABLE IF NOT EXISTS `advantage` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '自增主键（后台操作标识）',
  `value`      VARCHAR(20)  NOT NULL DEFAULT '' COMMENT '突出数字/短语（≤20）',
  `label`      VARCHAR(30)  NOT NULL DEFAULT '' COMMENT '标签（≤30）',
  `desc`       VARCHAR(100) NOT NULL DEFAULT '' COMMENT '说明（≤100）',
  `sort_order` INT          NOT NULL DEFAULT 0  COMMENT '排序（越小越前，默认按创建顺序）',
  `created_at` DATETIME     NOT NULL,
  `updated_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='首页数据与优势';

-- ---------- 8) 关于我们（单例，恒 1 行） ----------
CREATE TABLE IF NOT EXISTS `about` (
  `id`         TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '单例主键，固定为 1',
  `intro`      TEXT                             COMMENT '公司简介',
  `vision`     VARCHAR(200) NOT NULL DEFAULT '' COMMENT '愿景（≤200）',
  `mission`    VARCHAR(200) NOT NULL DEFAULT '' COMMENT '使命（≤200）',
  `values`     JSON         NULL            COMMENT '价值观 string[]',
  `timeline`   JSON         NULL            COMMENT '发展历程 {year,title,desc}[]',
  `abilities`  JSON         NULL            COMMENT '能力资质 {title,desc}[]',
  `updated_at` DATETIME     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='关于我们（单例）';

-- ---------- 9) 网站配置（单例，恒 1 行） ----------
-- 承载公司信息 / 联系方式 / 页脚 / SEO 等站点级配置，使运营可在后台修改。
-- 导航菜单（nav）与主题色（theme）**不落库**：前者配错路径会导致前台 404，
-- 后者受构建期 Tailwind 编译约束，均保持前端静态配置。
-- 社交链接（socials）为结构化列表，用 JSON 存储。
CREATE TABLE IF NOT EXISTS `site_config` (
  `id`            TINYINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '单例主键，固定为 1',
  `company_name`  VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '公司名称（≤50）',
  `logo`          VARCHAR(255) NOT NULL DEFAULT '' COMMENT 'Logo 图片路径（≤255）',
  `slogan`        VARCHAR(100) NOT NULL DEFAULT '' COMMENT '标语（≤100）',
  `description`   VARCHAR(500) NOT NULL DEFAULT '' COMMENT '公司简介（≤500）',
  `phone`         VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '联系电话（≤50）',
  `email`         VARCHAR(100) NOT NULL DEFAULT '' COMMENT '联系邮箱（≤100）',
  `address`       VARCHAR(200) NOT NULL DEFAULT '' COMMENT '联系地址（≤200）',
  `work_time`     VARCHAR(100) NOT NULL DEFAULT '' COMMENT '工作时间（≤100）',
  `map_image`     VARCHAR(255) NOT NULL DEFAULT '' COMMENT '地图占位图路径（≤255）',
  `copyright`     VARCHAR(200) NOT NULL DEFAULT '' COMMENT '版权文案（≤200）',
  `icp`           VARCHAR(100) NOT NULL DEFAULT '' COMMENT '备案号（≤100）',
  `socials`       JSON         NULL            COMMENT '社交链接 {label,url,icon}[]',
  `seo_title`     VARCHAR(200) NOT NULL DEFAULT '' COMMENT 'SEO 标题（≤200）',
  `seo_desc`      VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'SEO 描述（≤500）',
  `seo_keywords`  VARCHAR(500) NOT NULL DEFAULT '' COMMENT 'SEO 关键词（≤500）',
  `updated_at`    DATETIME     NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='网站配置（单例）';

-- ---------- 10) message 表（向后兼容：不存在则连同新列一起创建，存在则仅补列） ----------
CREATE TABLE IF NOT EXISTS `message` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '留言 ID',
  `name`       VARCHAR(30)  NOT NULL DEFAULT ''  COMMENT '姓名',
  `company`    VARCHAR(50)  NULL DEFAULT NULL     COMMENT '公司名称（选填）',
  `phone`      VARCHAR(20)  NOT NULL DEFAULT ''  COMMENT '电话',
  `email`      VARCHAR(100) NOT NULL DEFAULT ''  COMMENT '邮箱',
  `content`    VARCHAR(500) NOT NULL DEFAULT ''  COMMENT '留言内容',
  `ip`         VARCHAR(45)  NOT NULL DEFAULT ''  COMMENT '提交者 IP',
  `status`     TINYINT      NOT NULL DEFAULT 0   COMMENT '处理状态 0=待处理 1=已处理',
  `handled_at` DATETIME     NULL DEFAULT NULL    COMMENT '处理时间',
  `created_at` DATETIME     NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_ip_created` (`ip`, `created_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='网站留言表';

-- message 补列（幂等：先查 information_schema，再按需 ALTER）
SET @db_name = DATABASE();
SET @msg_exists = (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'message');
SET @status_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'status');
SET @sql_status = IF(@msg_exists = 1 AND @status_exists = 0, 'ALTER TABLE `message` ADD COLUMN `status` TINYINT NOT NULL DEFAULT 0 COMMENT ''处理状态 0=待处理 1=已处理'' AFTER `ip`', 'SELECT 1');
PREPARE stmt_status FROM @sql_status;
EXECUTE stmt_status;
DEALLOCATE PREPARE stmt_status;
SET @handled_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'message' AND COLUMN_NAME = 'handled_at');
SET @sql_handled = IF(@msg_exists = 1 AND @handled_exists = 0, 'ALTER TABLE `message` ADD COLUMN `handled_at` DATETIME NULL DEFAULT NULL COMMENT ''处理时间'' AFTER `status`', 'SELECT 1');
PREPARE stmt_handled FROM @sql_handled;
EXECUTE stmt_handled;
DEALLOCATE PREPARE stmt_handled;
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = @db_name AND TABLE_NAME = 'message' AND INDEX_NAME = 'idx_status');
SET @sql_idx = IF(@msg_exists = 1 AND @idx_exists = 0, 'ALTER TABLE `message` ADD KEY `idx_status` (`status`)', 'SELECT 1');
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

-- ---------- 11) 操作日志（审计流水，高增长追加表；只增不改） ----------
-- 说明：
--   * admin_id 不设外键、不级联删除 —— 账号被删后其历史日志仍可读（靠 admin_name 快照）；
--   * id 为 INT UNSIGNED AUTO_INCREMENT，插入序即时间序，配合 (created_at,id) 索引支持「倒序分页」免 filesort；
--   * 索引按「维度 + created_at + id」组合，覆盖 模块/操作人/结果/时间 各筛选 + 默认倒序；
--   * result=1 成功 / 0 失败；detail ≤500 字符（写入器截断）。
CREATE TABLE IF NOT EXISTS `op_log` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志主键',
  `admin_id`    INT UNSIGNED NOT NULL DEFAULT 0        COMMENT '操作人 ID；0=未识别（如登录失败账号不存在）',
  `admin_name`  VARCHAR(50)  NOT NULL DEFAULT ''       COMMENT '操作人账号名快照（账号删改后仍可读）',
  `created_at`  DATETIME     NOT NULL                  COMMENT '操作时间（服务端时间）',
  `module`      VARCHAR(20)  NOT NULL DEFAULT ''       COMMENT '业务模块（枚举：auth/product/news/case/advantage/about/site/message/account/upload）',
  `action`      VARCHAR(20)  NOT NULL DEFAULT ''       COMMENT '动作（枚举：login/logout/create/update/delete/enable/disable/reset_password/change_password/upload）',
  `target`      VARCHAR(120) NOT NULL DEFAULT ''       COMMENT '目标对象可读标识（内容=slug、账号=账号名、单例=常量）',
  `target_name` VARCHAR(120) NOT NULL DEFAULT ''       COMMENT '目标对象人类可读名（删除后仍保留当时名称）',
  `ip`          VARCHAR(45)  NOT NULL DEFAULT ''       COMMENT '来源 IP（兼容 IPv6）',
  `user_agent`  VARCHAR(255) NOT NULL DEFAULT ''       COMMENT '请求 UA（截断 255）',
  `result`      TINYINT      NOT NULL DEFAULT 1        COMMENT '1=成功 0=失败',
  `detail`      VARCHAR(500) NOT NULL DEFAULT ''       COMMENT '变化摘要 / 失败原因（≤500，超长截断加 …）',
  PRIMARY KEY (`id`),
  KEY `idx_created`        (`created_at`, `id`),
  KEY `idx_module_created` (`module`, `created_at`, `id`),
  KEY `idx_admin_created`  (`admin_name`, `created_at`, `id`),
  KEY `idx_result_created` (`result`, `created_at`, `id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='后台操作日志（审计流水）';
