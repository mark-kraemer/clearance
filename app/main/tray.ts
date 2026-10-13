import { join } from 'node:path';

import { Menu, Tray, app, nativeImage } from 'electron';

import type { Run } from '../core/types';

// A menu-bar item with the needs-you count, so the board is one click away
// when the window is behind other apps. The icon is the app mark on the 16pt
// status-glyph grid, shipped as build/trayTemplate.png (with an @2x sibling
// Electron picks up by name) and marked as a template so macOS tints it for
// light and dark menu bars.
let tray: Tray | null = null;

function iconPath(): string {
  return join(app.getAppPath(), 'build', 'trayTemplate.png');
}

export function ensureTray(onOpen: () => void, onNewRun: () => void, onQuit: () => void): void {
  if (tray) return;
  const img = nativeImage.createFromPath(iconPath());
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
