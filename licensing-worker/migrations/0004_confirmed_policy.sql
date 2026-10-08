/* Licensing metadata only. Trials start once; clinical databases are untouched. */
ALTER TABLE licenses ADD COLUMN trial_started_at INTEGER;
/* Existing started trials retain their previously audited validity. Never restart them. */
UPDATE licenses SET trial_started_at=(SELECT min(created_at) FROM activations WHERE license_id=licenses.id) WHERE kind='trial' AND EXISTS(SELECT 1 FROM activations WHERE license_id=licenses.id);
/* No online grant can promise more than the confirmed 30-day offline ceiling. */
UPDATE licenses SET offline_seconds=min(offline_seconds,2592000);
CREATE TRIGGER trial_start_once BEFORE UPDATE OF trial_started_at ON licenses WHEN OLD.trial_started_at IS NOT NULL AND NEW.trial_started_at IS NOT OLD.trial_started_at BEGIN SELECT RAISE(ABORT,'trial unavailable'); END;
