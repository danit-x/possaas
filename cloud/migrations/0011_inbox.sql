-- Pay out from the owner's phone (a supplier paid by bank, a bill that came in) waits in the inbox
-- (made for the manager phone, 0007) until the shop server takes it, every few seconds while it is
-- online, and stores it as an ordinary event. The shop PC stays the truth: nothing here counts until
-- the shop has it. Taken rows stay, marked, so a lost answer never brings them twice.
ALTER TABLE inbox ADD COLUMN taken_at INTEGER;
CREATE INDEX ix_inbox_waiting ON inbox (tenant_id, taken_at, seq);
