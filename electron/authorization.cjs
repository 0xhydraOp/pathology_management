const crypto=require('crypto');
const SESSION_MAX_AGE_MS=12*60*60*1000;
const LOGIN_FAILURE_LIMIT=5,LOGIN_COOLDOWN_MS=30000;
function denied(message){throw new Error(`Permission denied: ${message}`);}
function createAuthorization(db,{now=Date.now,onRevoke=()=>{},isTrusted=()=>true}={}){
 const sessions=new Map(),observed=new WeakSet();
 // One main-process budget across renderer IDs and usernames. No credentials
 // are retained; restarting the local application resets this in-memory budget.
 let failures=0,blockedUntil=0;
 const failedLogin=()=>{if(++failures>=LOGIN_FAILURE_LIMIT)blockedUntil=now()+LOGIN_COOLDOWN_MS;return null;};
 const clear=sender=>{if(sessions.delete(sender.id))onRevoke(sender.id);};
 const trusted=e=>{
  if(!e?.sender || e.sender.isDestroyed?.() || !isTrusted(e))denied('An authorized application window is required.');
  if(e.senderFrame && e.sender.mainFrame && e.senderFrame!==e.sender.mainFrame)denied('Only the main application frame may call this operation.');
 };
 const origin=e=>(e.senderFrame?.url || e.sender.getURL?.() || '').split('#')[0];
 const current=e=>{
  trusted(e);const session=sessions.get(e.sender.id);if(!session)return null;
  const user=db.get('SELECT id,username,role,display_name AS displayName,password_hash FROM users WHERE id=?',[session.id]);
  if(session.sender!==e.sender || session.origin!==origin(e) || now()-session.created>=SESSION_MAX_AGE_MS || !user || !['admin','staff'].includes(user.role) || user.role!==session.role || user.username!==session.username || user.password_hash!==session.credential){clear(e.sender);return null;}
  return {session,user:{id:user.id,username:user.username,role:user.role,displayName:user.displayName || user.username,requiresPasswordChange:session.requiresPasswordChange}};
 };
 const requireActor=(e,permission='staff')=>{const value=current(e);if(!value)denied('An authorized session is required. Sign in again.');if(value.user.requiresPasswordChange && permission!=='credential')denied('Password replacement required before normal operation.');if(permission==='admin' && value.user.role!=='admin')denied('Admin authorization is required.');return value.user;};
 return {
  trusted,clear,requireActor,
  getSession:e=>current(e)?.user || null,
  login(e,username,password){trusted(e);clear(e.sender);if(now()<blockedUntil)throw new Error('Too many sign-in attempts. Wait 30 seconds, then try again.');if(blockedUntil){failures=0;blockedUntil=0;}if(typeof username!=='string' || username.length>100 || typeof password!=='string' || password.length>1024)return failedLogin();const user=db.verifyUser(username,password);if(!user || !['admin','staff'].includes(user.role))return failedLogin();failures=0;const credential=db.get('SELECT password_hash FROM users WHERE id=?',[user.id]).password_hash;sessions.set(e.sender.id,{id:user.id,username:user.username,role:user.role,requiresPasswordChange:user.requiresPasswordChange,credential,created:now(),token:crypto.randomUUID(),sender:e.sender,origin:origin(e)});if(!observed.has(e.sender)){observed.add(e.sender);e.sender.once('destroyed',()=>clear(e.sender));e.sender.on?.('did-navigate',(_,url)=>{const session=sessions.get(e.sender.id);if(session && session.origin!==String(url).split('#')[0])clear(e.sender);});}return user;},
  lease(e,permission='staff'){requireActor(e,permission);return sessions.get(e.sender.id).token;},
  requireLease(e,token,permission='staff'){const actor=requireActor(e,permission);if(sessions.get(e.sender.id).token!==token)denied('The session changed while this operation was pending. Try again.');return actor;},
  invalidateAll(){for(const session of [...sessions.values()])clear(session.sender);},
  invalidateUser(id){for(const session of [...sessions.values()])if(session.id===id)clear(session.sender);},
 };
}
module.exports={createAuthorization,SESSION_MAX_AGE_MS,LOGIN_FAILURE_LIMIT,LOGIN_COOLDOWN_MS,denied};
