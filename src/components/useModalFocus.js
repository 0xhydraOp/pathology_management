import {useEffect,useRef} from 'react';
// Adds keyboard containment to existing overlays without changing their confirmation handlers.
export default function useModalFocus(active,dismiss){
 const ref=useRef(null),callback=useRef(dismiss);callback.current=dismiss;
 useEffect(()=>{
  if(!active || !ref.current)return;
  const root=ref.current,previous=document.activeElement;
  const controls=()=>Array.from(root.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')).filter(el=>!el.disabled && el.getClientRects().length);
  (controls()[0] || root).focus();
  const keydown=e=>{
   if(!root.contains(document.activeElement) && document.activeElement!==document.body)return;
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();callback.current?.();}
   if(e.key==='Tab'){const items=controls(),first=items[0],last=items.at(-1);if(!items.length){e.preventDefault();root.focus();return;}if(document.activeElement===document.body || document.activeElement===root){e.preventDefault();(e.shiftKey?last:first).focus();return;}if(e.shiftKey && document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first?.focus();}}
  };
  document.addEventListener('keydown',keydown);
  return()=>{document.removeEventListener('keydown',keydown);if(previous?.isConnected)previous.focus();};
 },[active]);return ref;
}
