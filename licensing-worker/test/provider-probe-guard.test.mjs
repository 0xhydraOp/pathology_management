import test from 'node:test';
import assert from 'node:assert/strict';
import {validateConfig,assertRevoked} from '../scripts/provider-contract-smoke.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('manual provider probe rejects absent staging authorization and mismatched clients without network',()=>{
 for(const configuration of [{},{confirmedStaging:false},{confirmedStaging:true,authorizedSyntheticProviderWrites:true,expectedClientId:'client_a',stagingClientId:'client_b',apiKeyFile:'C:/private/key',syntheticEmailDomain:'qa.example.invalid',outputParent:'C:/private'}])assert.throws(()=>validateConfig(configuration));
});
test('manual provider probe rejects owner domain and unknown credential-bearing fields before file reads',()=>{
 const configuration={confirmedStaging:true,authorizedSyntheticProviderWrites:true,expectedClientId:'client_a',stagingClientId:'client_a',apiKeyFile:'C:/private/key',syntheticEmailDomain:'qa.molladigital.com',outputParent:'C:/private'};
 assert.throws(()=>validateConfig(configuration));
 assert.throws(()=>validateConfig({...configuration,syntheticEmailDomain:'qa.example.invalid',apiKey:'not-a-secret'}));
});
test('malformed private config never prints its synthetic sensitive marker',()=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'patholy-probe-guard-'));try{const config=path.join(directory,'invalid.json'),marker='SYNTHETIC_PRIVATE_MARKER_93845';fs.writeFileSync(config,'{"key":"'+marker+'", INVALID');const result=spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/provider-contract-smoke.mjs',import.meta.url)),config,'--authorized-staging-write'],{encoding:'utf8',windowsHide:true});assert.equal(result.status,1);assert(!((result.stdout||'')+(result.stderr||'')).includes(marker));assert(!result.stderr.includes('SyntaxError'));}finally{fs.rmSync(directory,{recursive:true,force:true});}
});
test('provider revocation assertions use SDK status and reject known session IDs',()=>{
 assert.throws(()=>assertRevoked([{id:'session_synthetic',status:'active'}]));
 assert.throws(()=>assertRevoked([{id:'session_synthetic',status:'revoked'}],['session_synthetic']));
 assertRevoked([]);
 assertRevoked([{id:'session_other',status:'revoked'}],['session_synthetic']);
});
