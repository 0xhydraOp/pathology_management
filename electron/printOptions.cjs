const {validatePrintProfile}=require('./printProfile.cjs');
function nativePrintOptions(copies=1,input){
 const options={silent:false,printBackground:true,copies:Math.max(1,parseInt(copies,10)||1)};
 if(input){const p=validatePrintProfile(input);Object.assign(options,{pageSize:{width:Math.round(p.paperWidthMm*1000),height:Math.round(p.paperHeightMm*1000)},margins:{marginType:'none'},scaleFactor:100});}
 return options;
}
function pdfPrintOptions(input){
 if(!input)return {printBackground:true,preferCSSPageSize:true,pageSize:'A4',margins:{top:.25,bottom:.25,left:.25,right:.25}};
 const p=validatePrintProfile(input);
 return {printBackground:true,preferCSSPageSize:true,pageSize:{width:p.paperWidthMm/25.4,height:p.paperHeightMm/25.4},margins:{top:0,bottom:0,left:0,right:0},scale:1,displayHeaderFooter:false};
}
module.exports={nativePrintOptions,pdfPrintOptions};
