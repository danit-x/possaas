-- Parts of the POS per shop (src/domain/features.ts), switched on /admin → a shop → Parts. The shop
-- server picks them up on its next copy (GET /api/v1/replica) and says which it has
-- (x-station-features), so the admin page can show "Shop has these" or "Waiting for the shop".
ALTER TABLE shops ADD COLUMN features TEXT;            -- JSON of the parts set; NULL = every part at its default
ALTER TABLE devices ADD COLUMN features_seen TEXT;     -- JSON of the parts the shop server says it has
-- What a change was ("Two kitchens on"), beside who and when.
ALTER TABLE admin_log ADD COLUMN detail TEXT;
