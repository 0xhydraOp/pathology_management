/* Durable managed-identity correlation and separately verified recovery factor. */
ALTER TABLE owner_auth_identity ADD COLUMN external_id TEXT;
ALTER TABLE owner_auth_identity ADD COLUMN provision_operation_id TEXT;
ALTER TABLE owner_auth_identity ADD COLUMN backup_factor_id TEXT;
ALTER TABLE owner_auth_identity ADD COLUMN backup_verified_at INTEGER;
ALTER TABLE owner_auth_identity ADD COLUMN recovery_operation_id TEXT;
CREATE UNIQUE INDEX owner_external_id ON owner_auth_identity(external_id) WHERE external_id IS NOT NULL;
CREATE TABLE owner_auth_operations(id TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN('provision','backup-enroll','recovery')),external_id TEXT UNIQUE,user_id TEXT,stage TEXT NOT NULL,old_factor_id TEXT,new_factor_id TEXT,nonce_hash TEXT,epoch INTEGER,expires_at INTEGER,attempts INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE TABLE owner_auth_operator_tickets(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,user_id TEXT,operation_id TEXT,purpose TEXT NOT NULL CHECK(purpose IN('provision-reconcile','primary-recovery')),epoch INTEGER NOT NULL,expires_at INTEGER NOT NULL,consumed_at INTEGER,CHECK((purpose='provision-reconcile' AND operation_id IS NOT NULL) OR (purpose='primary-recovery' AND user_id IS NOT NULL)));
CREATE TRIGGER owner_user_pin BEFORE UPDATE OF user_id ON owner_auth_identity WHEN OLD.user_id IS NOT NULL AND NEW.user_id IS NOT OLD.user_id BEGIN SELECT RAISE(ABORT,'owner identity immutable'); END;
CREATE TRIGGER owner_external_pin BEFORE UPDATE OF external_id ON owner_auth_identity WHEN OLD.external_id IS NOT NULL AND NEW.external_id IS NOT OLD.external_id BEGIN SELECT RAISE(ABORT,'owner correlation immutable'); END;
CREATE INDEX owner_operation_nonce ON owner_auth_operations(nonce_hash);
CREATE TABLE owner_auth_external_lease(id INTEGER PRIMARY KEY CHECK(id=1),nonce TEXT NOT NULL,expires_at INTEGER NOT NULL);
