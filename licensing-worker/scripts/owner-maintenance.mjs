// Operator capabilities are registered only through authenticated deployment
// administration. They cannot replace password and recovery-factor proof.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { privateDirectory } from './owner-bootstrap.mjs';

const workerRoot = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const userId = /^user_[A-Za-z0-9_]{1,120}$/;
const hash = /^[A-Za-z0-9_-]{43}$/;
const ownerOrigin = 'https://admin.molladigital.com';

export function buildMaintenanceSql(metadata) {
  const { id, tokenHash, purpose, ownerUserId, operationId, ownerEpoch, createdAt, expiresAt } = metadata;
  if (!uuid.test(id) || !hash.test(tokenHash) || !Number.isSafeInteger(ownerEpoch) || ownerEpoch < 1 || !Number.isSafeInteger(createdAt) || createdAt < 0 || expiresAt !== createdAt + 900 ||
      !['primary-recovery', 'provision-reconcile'].includes(purpose) ||
      (ownerUserId !== null && !userId.test(ownerUserId)) ||
      (operationId !== null && !uuid.test(operationId)) ||
      (purpose === 'primary-recovery' && (!ownerUserId || operationId !== null)) ||
      (purpose === 'provision-reconcile' && !operationId)) throw Error('Invalid maintenance metadata.');
  // Validated identifiers contain no quotes. No password or raw token is SQL.
  const uid = ownerUserId === null ? 'NULL' : `'${ownerUserId}'`;
  const op = operationId === null ? 'NULL' : `'${operationId}'`;
  const binding = purpose === 'primary-recovery'
    ? `EXISTS(SELECT 1 FROM owner_auth_identity i WHERE i.id=1 AND i.email='iamrobiul94@gmail.com' AND i.user_id=${uid} AND i.epoch=${ownerEpoch} AND i.state IN('active','credential-changing') AND i.backup_factor_id IS NOT NULL AND i.backup_verified_at IS NOT NULL)`
    : `EXISTS(SELECT 1 FROM owner_auth_identity i JOIN owner_auth_operations o ON o.id=i.provision_operation_id WHERE i.id=1 AND i.email='iamrobiul94@gmail.com' AND i.epoch=${ownerEpoch} AND i.state IN('provisioning','active') AND i.factor_verified_at IS NULL AND i.backup_verified_at IS NULL AND o.id=${op} AND o.kind='provision' AND o.external_id=i.external_id AND i.external_id IS NOT NULL AND i.user_id IS ${uid})`;
  return `UPDATE owner_auth_operator_tickets SET consumed_at=${createdAt} WHERE consumed_at IS NULL AND purpose='${purpose}' AND user_id IS ${uid} AND operation_id IS ${op};
INSERT INTO owner_auth_operator_tickets(id,token_hash,user_id,operation_id,purpose,epoch,expires_at,consumed_at) VALUES('${id}',CASE WHEN ${binding} THEN '${tokenHash}' ELSE NULL END,${uid},${op},'${purpose}',${ownerEpoch},${expiresAt},NULL);
INSERT INTO owner_audit(id,actor,action,customer_id,license_id,created_at,details) VALUES('${crypto.randomUUID()}','deployment-operator','owner.maintenance.register',NULL,NULL,${createdAt},'{"purpose":"${purpose}","ticketId":"${id}","expiresAt":${expiresAt}}');
`;
}

export function prepareMaintenance(config) {
  const keys = ['ownerOrigin', 'outputParent', 'purpose', 'ownerUserId', 'operationId', 'ownerEpoch'];
  if (!config || Object.keys(config).length !== keys.length || !keys.every(key => Object.hasOwn(config, key)) || config.ownerOrigin !== ownerOrigin || typeof config.outputParent !== 'string') throw Error('Use the fixed origin and exact non-secret maintenance metadata.');
  const createdAt = Math.floor(Date.now() / 1000), token = crypto.randomBytes(32).toString('base64url');
  const metadata = { ...config, id: crypto.randomUUID(), tokenHash: crypto.createHash('sha256').update(token).digest('base64url'), createdAt, expiresAt: createdAt + 900 };
  const sql = buildMaintenanceSql(metadata); // Validate before writing anything.
  const directory = privateDirectory(config.outputParent);
  const sqlFile = path.join(directory, 'register-maintenance.sql'), linkFile = path.join(directory, 'owner-maintenance.secret.json');
  const page = config.purpose === 'primary-recovery' ? '/owner/recover' : '/owner/reconcile';
  fs.writeFileSync(sqlFile, sql, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(linkFile, JSON.stringify({ link: ownerOrigin + page + '#token=' + token, expiresAt: metadata.expiresAt, purpose: config.purpose, registration: 'Not registered. Do not deliver.' }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  return { directory, sqlFile, linkFile };
}

function deployedBinding() {
  const text = fs.readFileSync(path.join(workerRoot, 'wrangler.jsonc'), 'utf8');
  const database = text.match(/"binding"\s*:\s*"DB"[\s\S]*?"database_id"\s*:\s*"([a-f0-9-]+)"/i)?.[1];
  if (!database || !uuid.test(database) || database === '00000000-0000-0000-0000-000000000000') throw Error('A reviewed deployed D1 binding is required.');
}
function wrangler(args) {
  return execFileSync(process.execPath, [path.join(workerRoot, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', path.join(workerRoot, 'wrangler.jsonc'), '--json'], { cwd: workerRoot, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, maxBuffer: 1024 * 1024 });
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--inspect') {
    deployedBinding();
    const result = JSON.parse(wrangler(['d1', 'execute', 'DB', '--remote', '--command', "SELECT user_id AS ownerUserId,epoch AS ownerEpoch,provision_operation_id AS provisionOperationId,external_id AS externalId,state,CASE WHEN backup_verified_at IS NULL THEN 0 ELSE 1 END AS recoveryConfigured FROM owner_auth_identity WHERE id=1", '--yes']).toString('utf8'));
    const rows = Array.isArray(result) ? result.flatMap(r => r.results || []) : [];
    if (rows.length !== 1) throw Error('No single bound owner metadata record.');
    console.log(JSON.stringify(rows[0], null, 2)); // Explicit non-secret fields only.
    return;
  }
  const [configFile, operation] = args;
  if (args.length !== 2 || !['--prepare-only', '--register-remote'].includes(operation)) throw Error('Use config-file --prepare-only|--register-remote, or --inspect.');
  if (operation === '--register-remote') deployedBinding();
  const prepared = prepareMaintenance(JSON.parse(fs.readFileSync(configFile, 'utf8')));
  if (operation === '--register-remote') {
    wrangler(['d1', 'execute', 'DB', '--remote', '--file', prepared.sqlFile, '--yes']);
    const record = JSON.parse(fs.readFileSync(prepared.linkFile, 'utf8'));
    record.registration = 'Registered by authenticated deployment administration; password and recovery authenticator are still required for recovery.';
    fs.writeFileSync(prepared.linkFile, JSON.stringify(record, null, 2) + '\n', { mode: 0o600 });
  }
  console.log(operation === '--prepare-only' ? 'Protected maintenance files prepared; no remote operation occurred. No secret was printed.' : 'Maintenance capability registered. Read the protected link file privately; no secret was printed.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => { console.error('Maintenance preparation/registration failed or has an uncertain outcome. Do not deliver material; inspect authenticated deployment state privately. No credentials were logged.'); process.exitCode = 1; });
