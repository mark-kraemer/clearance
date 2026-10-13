import { Menu, Tray, nativeImage } from 'electron';

import type { Run } from '../core/types';

// A menu-bar item with the needs-you count, so the board is one click away
// when the window is behind other apps. The icon is drawn, not loaded: a
// 16pt template circle with a dot, which macOS tints for light and dark.
let tray: Tray | null = null;

function iconDataUrl(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="#000" stroke-width="1.6"/><circle cx="8" cy="8" r="2" fill="#000"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

export function ensureTray(onOpen: () => void, onNewRun: () => void, onQuit: () => void): void {
  if (tray) return;
  const img = nativeImage.createFromDataURL(iconDataUrl()).resize({ width: 16, height: 16 });
  img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip('Clearance');
  tray.on('click', onOpen);
  updateTray([], onOpen, onNewRun, onQuit);
}

export function updateTray(runs: Run[], onOpen: () => void, onNewRun: () => void, onQuit: () => void): void {
  if (!tray) return;
  const needs = runs.filter((r) => r.status === 'needs' && r.gate).sort((a, b) => a.gate!.since - b.gate!.since);
  tray.setTitle(needs.length ? String(needs.length) : '');
  const items: Electron.MenuItemConstructorOptions[] = needs.length
    ? needs.slice(0, 6).map((r) => ({ label: `${r.key ? r.key + ' ' : ''}${r.title}  ·  ${r.gate!.id} ${r.gate!.name}`, click: () => onOpen() }))
    : [{ label: 'Nothing needs you', enabled: false }];
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: needs.length ? `${needs.length} need${needs.length === 1 ? 's' : ''} you` : 'Clearance', enabled: false },
    { type: 'separator' },
    ...items,
    { type: 'separator' },
    { label: 'Open Clearance', click: onOpen },
    { label: 'New Run…', accelerator: 'CmdOrCtrl+N', click: onNewRun },
    { type: 'separator' },
    { label: 'Quit Clearance', accelerator: 'CmdOrCtrl+Q', click: onQuit },
  ]));
}
