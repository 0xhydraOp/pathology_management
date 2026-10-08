'use strict';
// Daily online verification, limited retry bursts and a quiet cooldown. This
// scheduler never changes a grant or extends its signed validation deadline.
const DAY=86400000;
const RETRY_DELAYS=[60000,300000,1800000,7200000,21600000];
class LicensingScheduler {
 constructor(manager,{setTimer=setTimeout,clearTimer=clearTimeout,onStatus=()=>{}}={}){this.manager=manager;this.setTimer=setTimer;this.clearTimer=clearTimer;this.onStatus=onStatus;this.timer=null;this.closed=false;this.running=false;this.failures=0;this.nextAttemptAt=null;}
 eligible(){return !this.closed&&this.manager.configured()&&Boolean(this.manager.data?.key);}
 schedule(delay){this.clearTimer(this.timer);this.timer=null;this.nextAttemptAt=null;if(!this.eligible())return;this.nextAttemptAt=Date.now()+delay;this.timer=this.setTimer(()=>{this.timer=null;void this.run();},delay);this.timer?.unref?.();}
 start(){this.schedule(0);}
 changed(){this.failures=0;this.schedule(DAY);}
 async run(){if(!this.eligible()||this.running)return;this.running=true;let success=false;try{await this.manager.refresh();this.failures=0;success=true;}catch{this.failures++;}finally{this.running=false;if(!this.closed){try{this.onStatus(this.manager.status());}catch{}this.schedule(success?DAY:(RETRY_DELAYS[this.failures-1]||DAY));}}}
 close(){this.closed=true;this.clearTimer(this.timer);this.timer=null;this.nextAttemptAt=null;}
}
module.exports={LicensingScheduler,DAY,RETRY_DELAYS};
