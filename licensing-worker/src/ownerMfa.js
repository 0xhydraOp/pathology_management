// These are explicitly configured claim contracts, not universal Access defaults.
// A live IdP/Access certification must precede selecting either in production.
export function hasOwnerMfaEvidence(claims, contract) {
  if (!claims || claims.type !== 'app' || typeof claims.email !== 'string' || !claims.email ||
      claims.email_verified === false || claims.non_identity === true || claims.non_identity === 'true') return false;
  let methods;
  if (contract === 'access-idp-amr-top-level-v1') {
    if (!Object.hasOwn(claims, 'amr')) return false;
    methods = claims.amr;
  } else if (contract === 'access-oidc-custom-amr-v1') {
    if (!Object.hasOwn(claims, 'custom') || !claims.custom || Array.isArray(claims.custom) ||
        typeof claims.custom !== 'object' || !Object.hasOwn(claims.custom, 'amr')) return false;
    methods = claims.custom.amr;
  } else return false;
  return Array.isArray(methods) && methods.length > 0 && methods.length <= 32 &&
    methods.every(method => typeof method === 'string' && method.length > 0 && method.length <= 80) &&
    methods.includes('mfa');
}
