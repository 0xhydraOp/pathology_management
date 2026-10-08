// Entitlement supplements authenticated roles; it never gates recovery or reading.
const restricted = new Set(['setupAdmin','registerPatientOrder', 'saveOrderResults', 'issueReport']);
function requireLicence(name, licensing) {
  if (!restricted.has(name)) return;
  if (!licensing) throw new Error('Licence allowance ended: activate this installation to register patients, edit results or finalize reports. Existing records, issued reprints, backups and recovery remain available.');
  licensing.requireOperation(name);
}
module.exports = { restricted, requireLicence };
