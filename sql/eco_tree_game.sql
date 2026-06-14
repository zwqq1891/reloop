-- Eco-Tree Game schema extension
-- Run AFTER schema.sql (requires the `users` table to exist)

USE reloop;

CREATE TABLE IF NOT EXISTS user_game_status (
  user_id               INT          NOT NULL,
  current_tree_name     VARCHAR(100) NOT NULL DEFAULT '我的小樹',
  tree_level            TINYINT      NOT NULL DEFAULT 1 COMMENT '1=種子 2=幼苗 3=小樹 4=成樹',
  current_exp           INT          NOT NULL DEFAULT 0,
  total_watered         INT          NOT NULL DEFAULT 0,
  total_fertilized      INT          NOT NULL DEFAULT 0,
  harvested_trees_count INT          NOT NULL DEFAULT 0,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
                                               ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_game_status_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- EXP thresholds per level:  Lv1=0  Lv2=100  Lv3=300  Lv4(成樹)=600
-- Action costs:  water=10 CCN/+15 EXP   fertilize=30 CCN/+50 EXP
-- Harvest (Lv4): free, resets tree, +1 to harvested_trees_count

CREATE TABLE IF NOT EXISTS game_action_logs (
  id            INT       NOT NULL AUTO_INCREMENT,
  user_id       INT       NOT NULL,
  action_type   ENUM('water', 'fertilize', 'harvest') NOT NULL,
  coin_spent    INT       NOT NULL DEFAULT 0,
  exp_gained    INT       NOT NULL DEFAULT 0,
  level_before  TINYINT   NOT NULL,
  level_after   TINYINT   NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  region       ENUM('north','central','south','east') NULL
               COMMENT '種植區域：僅在 action_type=harvest 時設置',
  INDEX idx_game_log_user (user_id),
  CONSTRAINT fk_game_log_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 若在既有資料庫上追加 region 欄位，執行下方一次性遷移 ──────────────────
-- ALTER TABLE game_action_logs
--   ADD COLUMN region ENUM('north','central','south','east') NULL
--   COMMENT '種植區域：僅在 action_type=harvest 時設置';
