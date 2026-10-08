function registerLicensingIpc(ipcMain, auth, licensing, {onChange=()=>{}}={}) {
  const notify = event => { if (!event.sender.isDestroyed?.()) event.sender.send?.('licensing:status', licensing.status()); onChange(); };
  ipcMain.handle('licensing:status', event => { auth.requireActor(event); return licensing.status(); });
  ipcMain.handle('licensing:activate', async (event, key) => {
    const token = auth.lease(event, 'admin');
    if (typeof key !== 'string' || key.length > 200) throw new Error('Enter a valid licence key.');
    const authorize = () => auth.requireLease(event, token, 'admin');
    const result = await licensing.activate(key, { authorize });
    authorize(); notify(event); return result;
  });
  ipcMain.handle('licensing:refresh', async event => {
    const token = auth.lease(event);
    const authorize = () => auth.requireLease(event, token);
    const result = await licensing.refresh({ authorize });
    authorize(); notify(event); return result;
  });
}
module.exports = { registerLicensingIpc };
