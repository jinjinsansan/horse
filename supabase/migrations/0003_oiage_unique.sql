-- ===============================================================
-- Migration 0003: oiage_state の UNIQUE 制約を修正
--
-- 問題:
--   UNIQUE(user_id, bet_type, is_active) は is_active=false の行が
--   残るとデータが複数行になり、upsertOiageState の .maybeSingle() が
--   エラーになりうる。また停止→再稼働のたびに別行が作成される。
--
-- 修正:
--   is_active を除いた (user_id, bet_type) のみを一意とする。
--   常に1ユーザー×1馬券種別につき1行だけ存在させる。
-- ===============================================================

-- 1. 既存の古い UNIQUE 制約を削除
ALTER TABLE oiage_state
    DROP CONSTRAINT IF EXISTS oiage_state_user_id_bet_type_is_active_key;

-- 2. (user_id, bet_type) だけで一意にする
ALTER TABLE oiage_state
    ADD CONSTRAINT oiage_state_user_id_bet_type_key UNIQUE (user_id, bet_type);

-- 3. 重複行がある場合のクリーンアップ（最新行を残す）
-- 実行前にデータを確認してから手動で調整することを推奨。
-- 念のため参考クエリを記載（コメントアウト済み）:
--
-- DELETE FROM oiage_state
-- WHERE id NOT IN (
--     SELECT DISTINCT ON (user_id, bet_type) id
--     FROM oiage_state
--     ORDER BY user_id, bet_type, updated_at DESC
-- );

-- ---------------------------------------------------------------
-- 確認クエリ:
--   SELECT user_id, bet_type, count(*) FROM oiage_state
--   GROUP BY user_id, bet_type HAVING count(*) > 1;
-- ---------------------------------------------------------------
