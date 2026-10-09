const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
function create(bytes){
 const file=path.join(os.tmpdir(),`pathology-report-preview-${crypto.randomUUID()}.pdf`);
 let fd;
 try{fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,bytes);return file;}
 catch(error){if(fd!==undefined){fs.closeSync(fd);fd=undefined;fs.unlinkSync(file);}throw error;}
 finally{if(fd!==undefined)fs.closeSync(fd);}
}
module.exports={create};
