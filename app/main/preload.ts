import { contextBridge, ipcRenderer } from 'electron';

// The renderer sees one small object. Every call crosses to the main process
// over IPC; nothing in the page touches the filesystem or a child process.
contextBridge.exposeInMainWorld('clearance', {
  onRuns: (cb: (runs: unknown[]) => void) => {
    const handler = (_e: unknown, runs: unknown[]) => cb(runs);
    ipcRenderer.on('runs', handler);
    return () => ipcRenderer.removeListener('runs', handler);
  },
  onNotice: (cb: (notice: unknown) => void) => {
    const handler = (_e: unknown, notice: unknown) => cb(notice);
    ipcRenderer.on('notice', handler);
    return () => ipcRenderer.removeListener('notice', handler);
  },
  ready: () => ipcRenderer.invoke('ready'),
  openInClaude: (id: string) => ipcRenderer.invoke('open-in-claude', id),
  continueInClaude: (id: string) => ipcRenderer.invoke('continue-in-claude', id),
  answer: (id: string, text: string, answers?: Record<string, string>) => ipcRenderer.invoke('answer', id, text, answers),
  decidePermission: (id: string, requestId: string, allow: boolean) => ipcRenderer.invoke('permission', id, requestId, allow),
  startRun: (input: unknown) => ipcRenderer.invoke('start-run', input),
  clearRun: (id: string) => ipcRenderer.invoke('clear-run', id),
  listRepos: () => ipcRenderer.invoke('list-repos'),
});
