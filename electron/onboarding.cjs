// Fresh bootstrap eligibility is derived only from the local database, never
// renderer roles or a client-supplied onboarding flag.
function isFreshInstall(db){return Boolean(db.credentialState().setupRequired&&db.get('SELECT COUNT(*) AS n FROM patients').n===0&&db.get('SELECT COUNT(*) AS n FROM orders').n===0&&db.get("SELECT COUNT(*) AS n FROM audit_log WHERE action='administrator-setup'").n===0);}
module.exports={isFreshInstall};
