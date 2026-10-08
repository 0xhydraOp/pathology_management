function registerLicensingIpc(ipcMain, auth, licensing, {onChange=()=>{},isFreshInstall=()=>false}={}) {
  const notify = event => { if (!event.sender.isDestroyed?.()) event.sender.send?.('licensing:status', licensing.status()); onChange(); };
  ipcMain.handle('licensing:onboarding', event => {auth.trusted(event);return isFreshInstall()?{freshInstallation:true,licensing:licensing.status()}:{freshInstallation:false};});
  ipcMain.handle('licensing:status', event => { auth.requireActor(event); return licensing.status(); });
  ipcMain.handle('licensing:activate', async (event, key) => {
    auth.trusted(event);
    let authorize;
    if(isFreshInstall()){
      authorize=()=>{auth.trusted(event);if(!isFreshInstall())throw new Error('Permission denied: installation setup changed. Sign in as the administrator.');};
    }else{
      const token=auth.lease(event,'admin');authorize=()=>auth.requireLease(event,token,'admin');
    }
    if (typeof key !== 'string' || key.length > 200) throw new Error('Enter a valid licence key.');
    const result = await licensing.activate(key, { authorize });
    authorize(); notify(event); return result;
  });
  ipcMain.handle('licensing:refresh', async event => {
    auth.trusted(event);
    let authorize;
    if(isFreshInstall())authorize=()=>{auth.trusted(event);if(!isFreshInstall())throw new Error('Permission denied: installation setup changed. Sign in again.');};
    else {const token=auth.lease(event);authorize=()=>auth.requireLease(event,token);}
    const result = await licensing.refresh({ authorize });
    authorize(); notify(event); return result;
  });
}
module.exports = { registerLicensingIpc };
