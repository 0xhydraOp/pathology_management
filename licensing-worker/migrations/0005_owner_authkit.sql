/* Identity and authentication receipts only; no patient data or passwords. */
CREATE TABLE owner_auth_identity(id INTEGER PRIMARY KEY CHECK(id=1),email TEXT NOT NULL CHECK(email='iamrobiul94@gmail.com'),user_id TEXT UNIQUE,state TEXT NOT NULL CHECK(state IN('unclaimed','provisioning','active','credential-changing')),epoch INTEGER NOT NULL DEFAULT 1,factor_id TEXT,factor_verified_at INTEGER);
CREATE TABLE owner_auth_bootstrap(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL UNIQUE,expires_at INTEGER NOT NULL,consumed_at INTEGER);
CREATE TABLE owner_auth_pending(nonce_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,stage TEXT NOT NULL CHECK(stage IN('enroll','enrolling','mfa')),epoch INTEGER NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,consumed_at INTEGER);
CREATE TABLE owner_auth_sessions(sid TEXT PRIMARY KEY,user_id TEXT NOT NULL,mfa_verified_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,epoch INTEGER NOT NULL,revoked_at INTEGER);
CREATE TABLE owner_auth_guard(id TEXT NOT NULL PRIMARY KEY);
CREATE INDEX owner_auth_sessions_user ON owner_auth_sessions(user_id,revoked_at);
CREATE INDEX owner_auth_pending_expiry ON owner_auth_pending(expires_at);

CREATE TABLE owner_auth_rate(bucket_key TEXT PRIMARY KEY,window INTEGER NOT NULL,count INTEGER NOT NULL);
