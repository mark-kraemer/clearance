import { execFile } from 'node:child_process';
import { join } from 'node:path';
import { BrowserWindow, Notification, app, globalShortcut, ipcMain, nativeTheme, shell } from 'electron';

import { groupRuns } from '../core/order';
import type { Run } from '../core/types';
import { OwnedRuns, type StartRunInput } from './owned';
import { ensureTray, updateTray } from './tray';
import { listRepos } from './repos';
import { ObservedSources } from './sources';

let win: BrowserWindow | null = null;
const observed = new ObservedSources();
// Inside a packaged app the server script must be a real file, so it is unpacked from the asar.
const owned = new OwnedRuns(join(__dirname, 'permission-server.mjs').replace('app.asar', 'app.asar.unpacked'));
owned.useStore((id) => observed.storeEntry(id));
owned.useDesktop((id) => observed.desktopView(id));
owned.on('log', (line: string) => { if (process.env.CLEARANCE_DEBUG) console.log(line); });
const seenGates = new Map<string, number>();
// The first publish that carries observed runs is launch state, not news.
let observedLoaded = false;

function allRuns(): Run[] {
  // An owned run is also a desktop-visible session once it starts, so the
  // owned copy wins and the observed one is dropped.
  const ownedIds = new Set(owned.runs.map((r) => r.cliSessionId));
  return [...owned.runs, ...observed.runs.filter((r) => !ownedIds.has(r.cliSessionId))];
}

function publish(): void {
  const runs = allRuns();
  win?.webContents.send('runs', runs);
  const needs = groupRuns(runs, Date.now()).needs.length;
  if (app.dock) app.dock.setBadge(needs ? String(needs) : '');
  updateTray(runs, showWindow, () => { showWindow(); win?.webContents.send('notice', { kind: 'new-run' }); }, () => app.quit());
  for (const r of runs) {
    if (r.gate && seenGates.get(r.id) !== r.gate.since) {
      seenGates.set(r.id, r.gate.since);
      if (observedLoaded && Date.now() - r.gate.since < 10 * 60 * 1000) notifyGate(r);
    }
    if (!r.gate) seenGates.delete(r.id);
  }
}

function notifyGate(r: Run): void {
  if (!Notification.isSupported() || !r.gate) return;
  const n = new Notification({ title: `${r.key || r.title} needs you`, body: `${r.gate.id} ${r.gate.name} · ${r.gate.summary}`, silent: false });
  n.on('click', () => {
    win?.show();
    win?.webContents.send('notice', { kind: 'focus-run', id: r.id });
  });
  n.show();
}

function showWindow(): void {
  if (!win) createWindow();
  win?.show();
  win?.focus();
}

function createWindow(): void {
  const [w, h] = (process.env.CLEARANCE_WIN || '1180x760').split('x').map(Number);
  win = new BrowserWindow({
    width: w,
    height: h,
    minWidth: 760,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 18 },
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1b1f' : '#ffffff',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  win.loadFile(join(__dirname, 'index.html'));
  win.on('closed', () => (win = null));
  win.webContents.on('console-message', (_e, level, message) => { if (level >= 2 || process.env.CLEARANCE_DEBUG) console.log('[renderer]', message); });
  win.webContents.on('did-fail-load', (_e, code, desc) => console.error('[renderer] failed to load', code, desc));
  const shot = process.env.CLEARANCE_SHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      console.log('[shot] loaded; capturing in', process.env.CLEARANCE_SHOT_DELAY || 2500, 'ms');
      setTimeout(async () => {
        try {
          const img = await win!.webContents.capturePage();
          const { writeFileSync } = await import('node:fs');
          writeFileSync(shot, img.toPNG());
          console.log('[shot] wrote', shot);
        } catch (err) {
          console.error('[shot] failed', err);
        }
        app.exit(0);
      }, Number(process.env.CLEARANCE_SHOT_DELAY || 2500));
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.handle('ready', () => allRuns());
// The desktop app registers `claude://` and its dock menu builds
// `code/continue?session=<local_…>` links from its own session ids, which are
// the host ids the session files carry. An owned run Clearance holds has no
// desktop session, so the jump for it is its worktree; handing it over is
// `continue-in-claude`.
const HOST_ID = /^local_[A-Za-z0-9-]{1,64}$/;
const CLI_ID = /^[0-9a-f-]{36}$/;
ipcMain.handle('open-in-claude', async (_e, id: string) => {
  const run = allRuns().find((r) => r.id === id);
  if (run?.hostSessionId && HOST_ID.test(run.hostSessionId)) {
    const url = `claude://code/continue?session=${run.hostSessionId}&source=clearance`;
    await shell.openExternal(url);
    return { kind: 'session', url };
  }
  // Handed over, but the desktop has not written its session file yet: ask again.
  if (run?.heldBy === 'desktop' && CLI_ID.test(run.cliSessionId)) {
    const url = `claude://resume?session=${run.cliSessionId}`;
    await shell.openExternal(url);
    return { kind: 'session', url };
  }
  if (run?.cwd) {
    shell.showItemInFolder(run.cwd);
    return { kind: 'worktree' };
  }
  execFile('open', ['-a', 'Claude'], () => undefined);
  return { kind: 'app' };
});
// `claude://resume?session=<cli id>` makes the desktop import a CLI session,
// or reopen (and unarchive) one it already knows.
ipcMain.handle('continue-in-claude', async (_e, id: string) => {
  const res = await owned.handToDesktop(id);
  if (!res.ok) return res;
  if (!CLI_ID.test(new URL(res.url).searchParams.get('session') || '')) return { ok: false, error: 'The run has no session id to hand over.' };
  await shell.openExternal(res.url);
  return res;
});
ipcMain.handle('answer', (_e, id: string, text: string, answers?: Record<string, string>) => owned.answer(id, text, answers));
ipcMain.handle('permission', (_e, id: string, requestId: string, allow: boolean) => owned.decidePermission(id, requestId, allow));
ipcMain.handle('start-run', (_e, input: StartRunInput) => owned.begin(input));
ipcMain.handle('clear-run', (_e, id: string) => owned.clear(id));
ipcMain.handle('list-repos', () => listRepos());

app.whenReady().then(async () => {
  createWindow();
  // Jump back from anywhere, Claude Code included.
  globalShortcut.register('Control+Option+C', showWindow);
  ensureTray(showWindow, () => { showWindow(); win?.webContents.send('notice', { kind: 'new-run' }); }, () => app.quit());
  observed.on('runs', () => {
    owned.sync(observed.desktopSessions());
    observed.track(owned.desktopHeld());
  });
  observed.on('error', (err) => console.error('[observed]', err));
  owned.on('runs', publish);
  owned.on('error', (err) => console.error('[owned]', err));
  await owned.start();
  await observed.start();
  publish();
  observedLoaded = true;
  // Dev only: start an owned run on launch so the whole path can be exercised headlessly.
  if (process.env.CLEARANCE_SMOKE_START) {
    const res = await owned.begin(JSON.parse(process.env.CLEARANCE_SMOKE_START) as StartRunInput);
    console.log('[smoke] begin ->', JSON.stringify(res));
  }
  if (process.env.CLEARANCE_SMOKE_ANSWER) {
    const { id, text, after } = JSON.parse(process.env.CLEARANCE_SMOKE_ANSWER) as { id: string; text: string; after?: number };
    setTimeout(async () => {
      win?.webContents.send('notice', { kind: 'focus-run', id });
      console.log('[smoke] answer ->', JSON.stringify(await owned.answer(id, text)));
    }, after || 3000);
  }
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // A control room keeps watching from the dock; closing the window does not quit.
});
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('before-quit', () => {
  void observed.stop();
  owned.shutdown();
});
