// Explicit offline OS-administrator intervention. No hidden account or default password.
const fs=require('fs'),path=require('path'),readline=require('readline'),{Writable}=require('stream');
const {openRecovery}=require('../electron/administratorRecovery.cjs'),credentials=require('../electron/credentials.cjs');
async function main(){
 const [directory,username,confirmation]=process.argv.slice(2);
 if(!directory||!username||confirmation!=='CONFIRM-OFFLINE-RECOVERY'||!process.stdin.isTTY)throw new Error('Usage: node scripts/recover-administrator.cjs <data-directory> <existing-admin-username> CONFIRM-OFFLINE-RECOVERY. Close the application first. Interactive terminal required.');
 if(!fs.existsSync(path.join(directory,'lab.db')))throw new Error('Existing database required; this command never creates an account.');
 let muted=false;const output=new Writable({write(chunk,encoding,callback){if(!muted)process.stdout.write(chunk,encoding);callback();}});const rl=readline.createInterface({input:process.stdin,output,terminal:true});
 const ask=prompt=>new Promise(resolve=>{process.stdout.write(prompt);muted=true;rl.question('',answer=>{muted=false;process.stdout.write('\n');resolve(answer);});});
 let db;try{const password=await ask('New administrator password (hidden, 12+ characters): '),confirm=await ask('Repeat new password: ');if(password!==confirm)throw new Error('Passwords do not match');credentials.validate(password);db=await openRecovery(path.resolve(directory));const {backup}=db.reset(username,password,'RESET ADMINISTRATOR');process.stdout.write('Administrator password replaced. Verified recovery copy: '+backup+'\n');}finally{rl.close();db?.close();}
}
main().catch(error=>{process.stderr.write(error.message+'\n');process.exitCode=1;});
