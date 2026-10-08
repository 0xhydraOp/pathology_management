const crypto=require('crypto');
const KDF={N:32768,r:8,p:3,maxmem:64*1024*1024};
const legacy=p=>crypto.pbkdf2Sync(p,'mondal-lab-2026',100000,64,'sha512').toString('hex');
function validate(p){if(typeof p!=='string'||p.length<12||p.length>1024||['admin123','mondal-default'].includes(p))throw new Error('Use a unique password of 12–1024 characters.');return p;}
function hash(p){const salt=crypto.randomBytes(16);return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(p,salt,64,KDF).toString('hex')}`;}
function verify(p,h){if(typeof p!=='string'||p.length>1024||typeof h!=='string')return false;let expected,actual;if(/^[a-f0-9]{128}$/.test(h)){expected=Buffer.from(h,'hex');actual=Buffer.from(legacy(p),'hex');}else{const parts=h.split('$');if(parts.length!==3||parts[0]!=='scrypt'||!/^[a-f0-9]{32}$/.test(parts[1])||!/^[a-f0-9]{128}$/.test(parts[2]))return false;expected=Buffer.from(parts[2],'hex');actual=crypto.scryptSync(p,Buffer.from(parts[1],'hex'),64,KDF);}return crypto.timingSafeEqual(expected,actual);}
module.exports={KDF,hash,verify,validate,isDefault:h=>verify('admin123',h),legacy};
