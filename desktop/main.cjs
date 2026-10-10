// Buffet Battle for desktop: the built web game (game/, from build-game.mjs) in an Electron window. It is served from
// app://buffetbattle/ rather than file://, so it has a real origin (the API allows it) and relative paths just work.
const { app, BrowserWindow, Menu, net, protocol, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const GAME = path.join(__dirname, 'game');
const HOST = 'buffetbattle';

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 360,
    backgroundColor: '#1d1410',
    title: 'Buffet Battle',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  // Links out (the game has none yet besides sign-in pages) open in the player's browser, never inside the game.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`app://${HOST}/`)) e.preventDefault();
  });
  // F11 (and Alt+Enter, as games do) toggles fullscreen.
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt)) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  win.loadURL(`app://${HOST}/index.html`);
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  // The game's files, and nothing outside its folder.
  protocol.handle('app', (req) => {
    const { host, pathname } = new URL(req.url);
    const file = path.normalize(path.join(GAME, decodeURIComponent(pathname)));
    if (host !== HOST || !file.startsWith(GAME + path.sep)) return new Response('Not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
