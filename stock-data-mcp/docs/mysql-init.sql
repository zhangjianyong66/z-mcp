-- stock-data-mcp MySQL 初始化脚本
-- 适用：MySQL 8.x
-- 使用前请把密码占位符替换为实际强密码。

CREATE DATABASE IF NOT EXISTS `stock_data`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_0900_ai_ci;

CREATE USER IF NOT EXISTS 'stock_data_app'@'%'
  IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';

GRANT SELECT, INSERT, UPDATE, DELETE, CREATE
  ON `stock_data`.*
  TO 'stock_data_app'@'%';

FLUSH PRIVILEGES;

USE `stock_data`;

CREATE TABLE IF NOT EXISTS `etf_universe` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `symbol` VARCHAR(16) NOT NULL COMMENT 'ETF 代码，可存 510300、SH510300、SZ159930',
  `normalized_symbol` VARCHAR(16)
    GENERATED ALWAYS AS (REPLACE(REPLACE(UPPER(`symbol`), 'SH', ''), 'SZ', '')) STORED,
  `name` VARCHAR(128) NOT NULL COMMENT 'ETF 名称',
  `theme` VARCHAR(128) NOT NULL COMMENT '主题/行业分类，用于 etf_batch_decide 主题暴露额度',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_etf_universe_symbol` (`symbol`),
  KEY `idx_etf_universe_normalized_symbol` (`normalized_symbol`),
  KEY `idx_etf_universe_theme` (`theme`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `etf_portfolios` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `total_capital` DECIMAL(20, 4) NOT NULL COMMENT '总资金',
  `available_capital` DECIMAL(20, 4) NOT NULL COMMENT '可用资金',
  `updated_at` DATETIME NOT NULL COMMENT '持仓快照更新时间',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_etf_portfolios_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `etf_positions` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `portfolio_id` BIGINT UNSIGNED NOT NULL,
  `symbol` VARCHAR(16) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `quantity` DECIMAL(20, 4) NOT NULL,
  `cost_price` DECIMAL(20, 6) NOT NULL,
  `current_price` DECIMAL(20, 6) NOT NULL,
  `market_value` DECIMAL(20, 4) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_etf_positions_portfolio_id` (`portfolio_id`),
  KEY `idx_etf_positions_symbol` (`symbol`),
  CONSTRAINT `fk_etf_positions_portfolio`
    FOREIGN KEY (`portfolio_id`) REFERENCES `etf_portfolios` (`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `etf_orders` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `order_id` VARCHAR(64) NULL COMMENT '外部交易单号，可为空',
  `symbol` VARCHAR(16) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `side` ENUM('buy', 'sell') NOT NULL,
  `quantity` DECIMAL(20, 4) NOT NULL,
  `order_time` DATETIME NOT NULL,
  `status` ENUM('pending', 'filled', 'cancelled', 'expired') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_etf_orders_order_id` (`order_id`),
  KEY `idx_etf_orders_symbol` (`symbol`),
  KEY `idx_etf_orders_order_time` (`order_time`),
  KEY `idx_etf_orders_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `sector_hot_latest` (
  `sector_name` VARCHAR(128) NOT NULL,
  `change_percent` DOUBLE NULL,
  `up_count` INT NULL,
  `down_count` INT NULL,
  `amount` DOUBLE NULL,
  `net_inflow` DOUBLE NULL,
  `leader_stock` VARCHAR(128) NULL,
  `leader_latest_price` DOUBLE NULL,
  `leader_change_percent` DOUBLE NULL,
  `market_score` DOUBLE NOT NULL,
  `news_score` DOUBLE NOT NULL,
  `hot_score` DOUBLE NOT NULL,
  `source` VARCHAR(32) NOT NULL,
  `generated_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,
  PRIMARY KEY (`sector_name`),
  KEY `idx_sector_hot_latest_hot_score` (`hot_score`),
  KEY `idx_sector_hot_latest_generated_at` (`generated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
