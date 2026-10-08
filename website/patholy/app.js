'use strict';
const trigger=document.getElementById('obtain-key');
const dialog=document.getElementById('contact-dialog');
trigger.addEventListener('click',()=>{dialog.showModal();document.documentElement.classList.add('modal-open');});
document.getElementById('close-dialog').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>{document.documentElement.classList.remove('modal-open');trigger.focus();});
dialog.addEventListener('keydown',event=>{
 if(event.key!=='Tab')return;
 const controls=[...dialog.querySelectorAll('a[href],button:not([disabled])')];
 const first=controls[0],last=controls.at(-1);
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
 else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
});
// Explicit Tab cycling supplements native modality; Escape uses native cancellation.
// Contact links are mailto only: no forms, analytics, credentials or API requests.
