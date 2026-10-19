-- ============================================================
-- 留言表建表脚本（MySQL 8 / utf8mb4）
-- 使用方式：
--   1) 创建数据库：CREATE DATABASE IF NOT EXISTS `corporate_site`
--      DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
--   2) 执行本脚本（或 mysql -uroot -proot corporate_site < database/message.sql）
-- ============================================================

CREATE DATABASE IF NOT EXISTS `corporate_site`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;

USE `corporate_site`;

CREATE TABLE IF NOT EXISTS `message` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '留言 ID',
  `name` VARCHAR(30) NOT NULL DEFAULT '' COMMENT '姓名',
  `company` VARCHAR(50) NULL DEFAULT NULL COMMENT '公司名称（选填）',
  `phone` VARCHAR(20) NOT NULL DEFAULT '' COMMENT '电话',
  `email` VARCHAR(100) NOT NULL DEFAULT '' COMMENT '邮箱',
  `content` VARCHAR(500) NOT NULL DEFAULT '' COMMENT '留言内容',
  `ip` VARCHAR(45) NOT NULL DEFAULT '' COMMENT '提交者 IP',
  `created_at` DATETIME NOT NULL COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_ip_created` (`ip`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='网站留言表';
