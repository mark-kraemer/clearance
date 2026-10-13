import { groupRuns } from '../core/order';
import type { Gate, Run, RunKind, Stage } from '../core/types';

// The page is the prototype's UI fed by the main process. All reads of the
// filesystem and all process control live on the other side of `clearance`.

interface Api {
  onRuns(cb: (runs: Run[]) => void): () => void;
  onNotice(cb: (n: { kind: string; id?: string }) => void): () => void;
  ready(): Promise<Run[]>;
  openInClaude(id: string): Promise<string | null>;
  answer(id: string, text: string, answers?: Record<string, string>): Promise<{ ok: boolean; error?: string }>;
  decidePermission(id: string, requestId: string, allow: boolean): Promise<{ ok: boolean; error?: string }>;
  startRun(input: { kind: RunKind; task: string; repoPath: string }): Promise<{ ok: boolean; id?: string; error?: string }>;
  clearRun(id: string): Promise<{ ok: boolean }>;
  listRepos(): Promise<{ path: string; label: string; baseBranch: string }[]>;
  setBadge(n: number): Promise<void>;
}
declare global {
  interface Window {
    clearance: Api;
  }
}
const api = window.clearance;

const $ = (id: string) => document.getElementById(id)!;
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const icon = (name: string, cls = '') => `<svg class="ico glyph ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const STAGE_ICON: Record<Stage['status'], string> = { pending: 'pending', active: 'active', done: 'done', skipped: 'skipped' };
const STAGE_CLS: Record<Stage['status'], string> = { pending: '', active: 'work', done: 'ok', skipped: 'skip' };

let runs: Run[] = [];
let selectedId: string | null = null;
let drafts: Record<string, { text: string; answers: Record<string, string> }> = {};
let hidden = new Set<string>();
try {
  hidden = new Set(JSON.parse(localStorage.getItem('clearance-hidden') || '[]'));
} catch {
  /* fresh profile */
}

const byId = (id: string | null) => runs.find((r) => r.id === id) || null;
const visible = () => runs.filter((r) => !hidden.has(r.id));
const grouped = () => groupRuns(visible(), Date.now());

function fmtDur(ms: number): string {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 1) return '<1m';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d >= 1) return `${d}d ${h % 24}h`;
  return `${h}h${m % 60 ? ` ${m % 60}m` : ''}`;
}
const clock = (at: number) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const activeStage = (r: Run) => r.stages.find((s) => s.status === 'active') || r.stages[r.stages.length - 1];

/* Markdown: the subset Claude writes at a gate. */
function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
}
function markdown(src: string): string {
  const lines = src.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  const para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para.length = 0;
  };
  while (i < lines.length) {
    const l = lines[i];
    if (/^\s*```/.test(l)) {
      flush();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre>${esc(buf.join('\n'))}</pre>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1])) {
      flush();
      const head = l.trim().slice(1, -1).split('|').map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++].trim().slice(1, -1).split('|').map((c) => c.trim()));
      out.push(`<div class="tablewrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const h = l.match(/^\s*(#{1,4})\s+(.*)$/);
    if (h) {
      flush();
      out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`);
      i++;
      continue;
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d+[.)]/.test(l);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i])) {
        let item = lines[i].replace(/^\s*([-*]|\d+[.)])\s+/, '');
        i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+[.)])\s+/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item)}</li>`);
      }
      out.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }
    if (/^\s*>\s?/.test(l)) {
      flush();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(l)) {
      flush();
      out.push('<hr>');
      i++;
      continue;
    }
    if (!l.trim()) {
      flush();
      i++;
      continue;
    }
    para.push(l.trim());
    i++;
  }
  flush();
  return out.join('');
}

/* List */
function renderList(): void {
  const g = grouped();
  const sections: [string, string, Run[], string][] = [
    ['needs', 'Needs you', g.needs, 'No run is waiting on you.'],
    ['working', 'Working', g.working, 'Nothing is running.'],
    ['done', 'Done today', g.done, ''],
  ];
  let n = 0;
  let html = '';
  if (!visible().length) {
    html = `<div class="list-empty"><b>No runs on the board</b>Start a pipeline in Claude Code, or press ⌘N to start one here.</div>`;
  }
  for (const [key, label, items, emptyText] of sections) {
    if (!visible().length) break;
    if (key === 'done' && !items.length) continue;
    html += `<div class="group-h ${key === 'needs' ? 'attn' : ''}"><span>${label}</span><span class="n">${items.length}</span></div>`;
    if (!items.length) html += `<div class="group-empty">${emptyText}</div>`;
    for (const r of items) {
      n += 1;
      const st = activeStage(r);
      let glyph: string, sub: string, trail: string;
      if (r.status === 'needs' && r.gate) {
        glyph = icon('attn', 'attn');
        sub = `${st?.label || ''} · ${r.gate.id} ${r.gate.name}`;
        trail = `<span class="wait">${fmtDur(Date.now() - r.gate.since)}</span>`;
      } else if (r.status === 'working') {
        glyph = icon('work', 'work pulse');
        sub = `${st?.label || ''} · ${esc(r.statusLabel)}`;
        trail = `<span class="wait">${fmtDur(Date.now() - r.started)} in</span>`;
      } else if (r.status === 'idle') {
        glyph = icon('pending', 'work');
        sub = `${st?.label || ''} · idle · ${esc(r.statusLabel)}`;
        trail = `<span class="wait">${fmtDur(Date.now() - r.lastActivity)} ago</span>`;
      } else {
        glyph = icon(r.done?.label === 'Stopped' ? 'skipped' : 'done', r.done?.label === 'Stopped' ? 'skip' : 'ok');
        sub = r.pr ? `${r.done?.label || 'Done'} · ${esc(r.pr.url.replace(/^https:\/\/github\.com\//, ''))}` : `${r.done?.label || 'Done'} · ${esc(r.kind || 'run')}`;
        trail = `<span class="wait">${fmtDur(Date.now() - (r.done?.when || r.lastActivity))} ago</span>`;
      }
      html += `<button class="row ${r.status}" role="option" data-id="${esc(r.id)}" aria-selected="${r.id === selectedId}" tabindex="${r.id === selectedId ? 0 : -1}">
        ${glyph}
        <span><span class="t"><span class="key">${esc(r.key)}</span><span class="name">${esc(r.title)}</span></span><span class="muted">${sub}</span></span>
        <span>${trail}${n <= 9 ? `<span class="num">⌘${n}</span>` : ''}</span>
      </button>`;
    }
  }
  $('list').innerHTML = html;
  const needsN = g.needs.length, workN = g.working.length;
  $('title-sub').textContent = visible().length ? (needsN ? `${needsN} need${needsN === 1 ? 's' : ''} you · ${workN} working` : `${workN} working · nothing needs you`) : 'no runs';
  document.title = needsN ? `Clearance (${needsN})` : 'Clearance';
  const shown = g.flat.length;
  $('status-left').textContent = `${shown} run${shown === 1 ? '' : 's'}`;
  $('status-mid').textContent = `${needsN} need you · ${workN} working · ${g.done.length} done today`;
  $('status-right').textContent = `${runs.filter((r) => r.source === 'owned').length} started here · ${runs.filter((r) => r.source === 'observed').length} from Claude Code`;
}

/* Detail */
function renderDetail(): void {
  const r = byId(selectedId);
  const el = $('detail');
  if (!r) {
    el.innerHTML = runs.length
      ? `<div class="empty">${icon('inbox')}<h2>No run selected</h2><p>Pick a run on the left, or press ⌘1 to ⌘9.</p></div>`
      : `<div class="empty">${icon('inbox')}<h2>No runs on the board</h2><p>Start a feature or bug pipeline in Claude Code and it appears here, or press ⌘N to start one from Clearance.</p></div>`;
    return;
  }
  const rail = r.stages.map((s) => `<div class="stage ${s.status}"><div class="s-top">${icon(STAGE_ICON[s.status], STAGE_CLS[s.status])}<span>${esc(s.label)}</span></div>${s.note ? `<div class="s-note">${inline(s.note)}</div>` : ''}</div>`).join('');
  let panel = '';
  if (r.status === 'needs' && r.gate) panel = gatePanel(r, r.gate);
  else if (r.status === 'working' || r.status === 'idle') panel = activityPanel(r);
  else panel = donePanel(r);
  const meta = [
    `<span class="badge kind">${r.kind || 'run'}</span>`,
    r.branch ? `<span>${icon('branch')}<code>${esc(r.branch)}</code></span>` : '',
    r.pr ? `<span>${icon('pr')}<a href="${esc(r.pr.url)}" target="_blank" rel="noopener">${esc(r.pr.url.replace(/^https:\/\/github\.com\//, ''))}</a> · ${esc(r.pr.state.toLowerCase())}</span>` : '',
    `<span>${icon('clock')}started ${fmtDur(Date.now() - r.started)} ago</span>`,
    `<span>${r.source === 'owned' ? 'started here' : 'from Claude Code'}</span>`,
  ].filter(Boolean).join('');
  el.innerHTML = `<div class="d-wrap">
    <button class="btn d-back" data-back>${icon('back')}Runs</button>
    <div class="d-head">
      <div class="grow"><span class="key">${esc(r.key)}</span><h1>${esc(r.title)}</h1><div class="meta">${meta}</div></div>
      <div class="actions"><button class="btn" data-open>${icon('open')}Open in Claude Code <kbd>⌘O</kbd></button></div>
    </div>
    <div class="rail" aria-label="Stages">${rail}</div>
    ${panel}
    ${r.activity.length && r.status === 'needs' ? `<h2 class="hist-h">Recent activity</h2><ul class="hist">${r.activity.slice(0, 8).map((a) => `<li>${icon('done', 'skip')}<span><b>${clock(a.at)}</b> · ${inline(a.text)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
  const ta = el.querySelector<HTMLTextAreaElement>('#answer');
  if (ta) autosize(ta);
}

function gatePanel(r: Run, g: Gate): string {
  const draft = drafts[r.id] || { text: '', answers: {} };
  const owned = r.source === 'owned';
  let body = '';
  if (g.permission) {
    body = `<p class="lede">Auto mode asked for a decision on <code>${esc(g.permission.toolName)}</code>.</p><pre class="perm">${esc(JSON.stringify(g.permission.input, null, 2))}</pre>`;
  } else {
    body = `<div class="md">${markdown(g.text || g.summary)}</div>`;
    if (g.questions?.length) {
      body += `<div class="qs">${g.questions.map((q, qi) => `<div class="q"><div class="qh">${esc(q.header || `Question ${qi + 1}`)}</div><div class="qt">${esc(q.question)}</div><div class="opts">${q.options.map((o) => `<button class="chip ${draft.answers[q.question] === o.label ? 'on' : ''}" data-q="${esc(q.question)}" data-opt="${esc(o.label)}" ${owned ? '' : 'disabled'} title="${esc(o.description || '')}">${esc(o.label)}</button>`).join('')}</div>${q.options.find((o) => o.label === draft.answers[q.question])?.description ? `<span class="od">${esc(q.options.find((o) => o.label === draft.answers[q.question])!.description)}</span>` : ''}</div>`).join('')}</div>`;
    }
  }
  let composer: string;
  if (!owned) {
    composer = `<div class="composer"><div class="observed-note"><span class="muted">This run belongs to the Claude desktop app, so the answer goes there.</span><button class="btn primary" data-open>${icon('open')}Open in Claude Code <kbd>⌘O</kbd></button></div></div>`;
  } else if (g.permission) {
    composer = `<div class="composer"><div class="field" style="justify-content:flex-end"><button class="btn" data-perm="deny">Deny</button><button class="btn primary" data-perm="allow">Allow once <kbd>⌘↩</kbd></button></div><div class="hint">Deny sends the run back to find another way. Nothing is remembered.</div></div>`;
  } else {
    composer = `<div class="composer">
      <form class="field" id="answer-form"><label class="vh" for="answer">Your answer</label><textarea id="answer" rows="1" placeholder="${g.questions?.length ? 'Anything to add, or just send the choices' : 'One line: go, or fix 1 and 3'}">${esc(draft.text)}</textarea><button class="btn primary" type="submit" id="send">${icon('send')}Send <kbd>⌘↩</kbd></button></form>
      <div class="hint">Sent to the session as your reply. The pipeline continues from this gate without another stop.</div><div class="err-line" id="answer-err" hidden></div></div>`;
  }
  return `<section class="panel attn" aria-label="Open gate">
    <div class="p-head"><span class="gate-id">${esc(g.id)}</span><strong>${esc(g.name)}</strong><span class="since">${icon('clock')}waiting ${fmtDur(Date.now() - g.since)}</span></div>
    <div class="p-body">${body}</div>${composer}</section>`;
}

function activityPanel(r: Run): string {
  const working = r.status === 'working';
  const items = r.activity.length ? r.activity.map((a, i) => `<li><span class="ts">${clock(a.at)}</span><span class="${working && i === 0 ? 'live' : ''}">${inline(a.text)}</span></li>`).join('') : `<li><span class="ts"></span><span class="muted">No activity read yet.</span></li>`;
  return `<section class="panel" aria-label="Activity">
    <div class="p-head">${working ? icon('work', 'work pulse') : icon('pending', 'work')}<strong>${working ? 'Working' : 'Idle'}</strong><span class="muted">${esc(r.statusLabel)}</span><span class="since">${icon('clock')}${working ? `${fmtDur(Date.now() - r.started)} in` : `${fmtDur(Date.now() - r.lastActivity)} ago`}</span></div>
    <div class="p-body"><ul class="activity">${items}</ul></div>
    <div class="p-foot"><span>${working ? 'No gate open. The next stop is the next gate.' : 'The last turn ended without a question. Nothing is waiting on you.'}</span>${r.source === 'owned' ? `<button class="btn" data-nudge>Send a message</button>` : `<button class="btn" data-open>${icon('open')}Open in Claude Code</button>`}</div>
  </section>`;
}

function donePanel(r: Run): string {
  const stopped = r.done?.label === 'Stopped';
  return `<section class="panel" aria-label="Result">
    <div class="p-head">${icon(stopped ? 'skipped' : 'done', stopped ? 'skip' : 'ok')}<strong>${esc(r.done?.label || 'Done')}</strong><span class="since">${fmtDur(Date.now() - (r.done?.when || r.lastActivity))} ago</span></div>
    <div class="p-body"><p>${r.done?.text ? inline(r.done.text) : 'Every stage closed.'}</p>${r.pr ? `<p><a href="${esc(r.pr.url)}" target="_blank" rel="noopener">${esc(r.pr.url.replace(/^https:\/\/github\.com\//, ''))}</a></p>` : ''}</div>
    <div class="p-foot"><span>${stopped ? 'Open it in Claude Code to continue.' : 'Every stage closed.'}</span><button class="btn" data-hide>${r.source === 'owned' ? 'Clear from board' : 'Hide from board'}</button></div>
  </section>`;
}

function autosize(ta: HTMLTextAreaElement): void {
  ta.style.height = 'auto';
  ta.style.height = Math.min(160, ta.scrollHeight) + 'px';
}

function render(): void {
  renderList();
  renderDetail();
}

function select(id: string | null, opts: { focusComposer?: boolean; focusList?: boolean } = {}): void {
  selectedId = id;
  $('app').dataset.view = id ? 'detail' : 'list';
  render();
  if (opts.focusComposer) {
    const ta = document.querySelector<HTMLTextAreaElement>('#answer');
    if (ta) {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }
  } else if (opts.focusList) {
    (document.querySelector('.row[aria-selected="true"]') as HTMLElement | null)?.focus();
  }
}

function toast(text: string): void {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  $('app').appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* Events */
$('list').addEventListener('click', (e) => {
  const row = (e.target as HTMLElement).closest<HTMLElement>('.row');
  if (row) select(row.dataset.id!, { focusList: true });
});
$('list').addEventListener('keydown', (e) => {
  const flat = grouped().flat;
  const i = flat.findIndex((r) => r.id === selectedId);
  if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); if (flat.length) select(flat[Math.min(flat.length - 1, i + 1)].id, { focusList: true }); }
  else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); if (flat.length) select(flat[Math.max(0, i - 1)].id, { focusList: true }); }
  else if (e.key === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); void openSheet(); }
  else if (e.key === 'Enter') { e.preventDefault(); const ta = document.querySelector<HTMLElement>('#answer'); if (ta) ta.focus(); else (document.querySelector('.detail .btn:not(.d-back)') as HTMLElement | null)?.focus(); }
});
$('detail').addEventListener('click', async (e) => {
  const r = byId(selectedId);
  if (!r) return;
  const t = e.target as HTMLElement;
  const chip = t.closest<HTMLElement>('[data-q]');
  if (chip && !chip.hasAttribute('disabled')) {
    const d = (drafts[r.id] ||= { text: '', answers: {} });
    d.answers[chip.dataset.q!] = chip.dataset.opt!;
    renderDetail();
    document.querySelector<HTMLTextAreaElement>('#answer')?.focus();
    return;
  }
  if (t.closest('[data-open]')) { await api.openInClaude(r.id); toast(`Opening ${r.key || r.title} in Claude Code`); return; }
  if (t.closest('[data-back]')) { select(null); return; }
  if (t.closest('[data-nudge]')) { toast('Sending between gates is on the way; open the run in Claude Code for now.'); return; }
  const perm = t.closest<HTMLElement>('[data-perm]');
  if (perm && r.gate?.permission) {
    const res = await api.decidePermission(r.id, r.gate.permission.requestId, perm.dataset.perm === 'allow');
    if (!res.ok) toast(res.error || 'Could not send the decision');
    return;
  }
  if (t.closest('[data-hide]')) {
    if (r.source === 'owned') await api.clearRun(r.id);
    else { hidden.add(r.id); try { localStorage.setItem('clearance-hidden', JSON.stringify([...hidden])); } catch { /* ignore */ } }
    const next = grouped().flat.find((x) => x.id !== r.id);
    select(next ? next.id : null, { focusList: true });
    return;
  }
});
$('detail').addEventListener('submit', async (e) => {
  if ((e.target as HTMLElement).id !== 'answer-form') return;
  e.preventDefault();
  const r = byId(selectedId);
  if (!r || !r.gate) return;
  const d = drafts[r.id] || { text: '', answers: {} };
  const text = (document.querySelector<HTMLTextAreaElement>('#answer')?.value || '').trim();
  const unanswered = (r.gate.questions || []).filter((q) => !d.answers[q.question]);
  if (!text && unanswered.length) { const err = $('answer-err'); err.textContent = `Pick an answer for: ${unanswered.map((q) => q.header || q.question).join(', ')}, or write one.`; err.hidden = false; return; }
  if (!text && !r.gate.questions?.length) { document.querySelector<HTMLTextAreaElement>('#answer')?.focus(); return; }
  const res = await api.answer(r.id, text, d.answers);
  if (!res.ok) { const err = $('answer-err'); err.textContent = res.error || 'Could not send'; err.hidden = false; return; }
  delete drafts[r.id];
  toast(`Sent to ${r.key || r.title}`);
});
$('detail').addEventListener('input', (e) => {
  const t = e.target as HTMLTextAreaElement;
  if (t.id === 'answer' && selectedId) {
    (drafts[selectedId] ||= { text: '', answers: {} }).text = t.value;
    autosize(t);
  }
});
$('detail').addEventListener('keydown', (e) => {
  const t = e.target as HTMLElement;
  if (t.id === 'answer' && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); (document.querySelector('#send') as HTMLElement | null)?.click(); }
  if (t.id === 'answer' && e.key === 'Escape') { t.blur(); (document.querySelector('.row[aria-selected="true"]') as HTMLElement | null)?.focus(); }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && document.querySelector('[data-perm="allow"]')) { e.preventDefault(); (document.querySelector('[data-perm="allow"]') as HTMLElement).click(); }
});

document.addEventListener('keyup', (e) => { if (e.key === 'Meta') $('app').classList.remove('meta'); });
window.addEventListener('blur', () => $('app').classList.remove('meta'));
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Meta') $('app').classList.add('meta');
  if (mod && e.key === 'k') { e.preventDefault(); openPalette(); return; }
  if (mod && e.key === 'n') { e.preventDefault(); void openSheet(); return; }
  if (!$('sheet').hidden) return;
  if (mod && e.key === 'o') { e.preventDefault(); if (selectedId) { void api.openInClaude(selectedId); toast('Opening in Claude Code'); } return; }
  if (mod && /^[1-9]$/.test(e.key)) {
    const r = grouped().flat[Number(e.key) - 1];
    if (r) { e.preventDefault(); select(r.id, { focusComposer: r.source === 'owned' && !!r.gate, focusList: !(r.source === 'owned' && r.gate) }); }
    return;
  }
  if (e.key === 'Escape' && !$('palette').hidden) closePalette();
});

/* New run sheet */
let nrKind: RunKind = 'feature';
let repos: { path: string; label: string; baseBranch: string }[] = [];
const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/g, '');
function updateDerived(): void {
  const raw = ($('nr-task') as HTMLInputElement).value.trim();
  const branch = slug(raw);
  const repo = repos.find((r) => r.path === ($('nr-repo') as HTMLSelectElement).value);
  $('nr-branch').textContent = branch ? `${repo ? repo.label.split('/').pop() : '…'}/.claude/worktrees/${branch} · from ${repo?.baseBranch || 'main'}` : '';
  $('nr-cmd').innerHTML = raw
    ? `<b>claude</b> -p --input-format stream-json --output-format stream-json --permission-mode auto "/pipeline ${nrKind} ${esc(raw)}"`
    : `<b>claude</b> -p --input-format stream-json --output-format stream-json --permission-mode auto "/pipeline ${nrKind} …"`;
}
async function openSheet(): Promise<void> {
  closePalette();
  nrKind = 'feature';
  $('sheet').querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String((b as HTMLElement).dataset.kind === 'feature')));
  ($('nr-task') as HTMLInputElement).value = '';
  $('nr-err').hidden = true;
  if (!repos.length) repos = await api.listRepos();
  const sel = $('nr-repo') as HTMLSelectElement;
  sel.innerHTML = repos.length ? repos.map((r) => `<option value="${esc(r.path)}">${esc(r.label)}</option>`).join('') : '<option value="">No repositories found</option>';
  updateDerived();
  $('sheet').hidden = false;
  $('nr-task').focus();
}
function closeSheet(): void { $('sheet').hidden = true; }
async function startRun(): Promise<void> {
  const task = ($('nr-task') as HTMLInputElement).value.trim();
  const repoPath = ($('nr-repo') as HTMLSelectElement).value;
  const err = $('nr-err');
  if (!task) { err.textContent = 'Name the task. Put the issue ID first when there is one.'; err.hidden = false; $('nr-task').focus(); return; }
  if (!repoPath) { err.textContent = 'No repository to start in. Make a worktree in Claude Code once and it appears here.'; err.hidden = false; return; }
  ($('nr-start') as HTMLButtonElement).disabled = true;
  const res = await api.startRun({ kind: nrKind, task, repoPath });
  ($('nr-start') as HTMLButtonElement).disabled = false;
  if (!res.ok) { err.textContent = res.error || 'Could not start the run.'; err.hidden = false; return; }
  closeSheet();
  toast(`Started ${task}`);
  if (res.id) select(res.id, { focusList: true });
}
$('btn-new').addEventListener('click', () => void openSheet());
$('sheet').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  if (t === $('sheet') || t.closest('[data-cancel]')) { closeSheet(); return; }
  const k = t.closest<HTMLElement>('[data-kind]');
  if (k) { nrKind = k.dataset.kind as RunKind; $('sheet').querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b === k))); updateDerived(); }
});
$('nr-task').addEventListener('input', () => { $('nr-err').hidden = true; updateDerived(); });
$('nr-repo').addEventListener('change', updateDerived);
$('newrun-form').addEventListener('submit', (e) => { e.preventDefault(); void startRun(); });
$('sheet').addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
  else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void startRun(); }
});

/* Palette */
let palIndex = 0;
type PalItem = { kind: 'run' | 'cmd'; id: string; label: string; key?: string; trail: string; glyph: string };
function palItems(q: string): { items: PalItem[]; cmds: PalItem[] } {
  q = q.trim().toLowerCase();
  const items = grouped().flat
    .filter((r) => !q || `${r.key} ${r.title} ${r.gate ? r.gate.id + ' ' + r.gate.name : ''}`.toLowerCase().includes(q))
    .map((r): PalItem => ({ kind: 'run', id: r.id, label: r.title, key: r.key, trail: r.gate ? `${r.gate.id} · waiting ${fmtDur(Date.now() - r.gate.since)}` : r.status === 'done' ? r.done?.label || 'done' : r.status, glyph: r.gate ? icon('attn', 'attn') : r.status === 'done' ? icon('done', 'ok') : icon('work', 'work') }));
  const cmds: PalItem[] = [
    { kind: 'cmd', id: 'new', label: 'New run', trail: '⌘N', glyph: icon('plus') },
    { kind: 'cmd', id: 'next', label: 'Jump to the run waiting longest', trail: '', glyph: icon('attn', 'attn') },
    { kind: 'cmd', id: 'theme', label: 'Toggle appearance', trail: '', glyph: icon('moon') },
    { kind: 'cmd', id: 'open', label: 'Open selected run in Claude Code', trail: '⌘O', glyph: icon('open') },
    { kind: 'cmd' as const, id: 'unhide', label: 'Show hidden runs', trail: '', glyph: icon('inbox') },
  ].map((c) => ({ ...c, kind: 'cmd' as const })).filter((c) => !q || c.label.toLowerCase().includes(q));
  return { items, cmds };
}
function renderPalette(): void {
  const { items, cmds } = palItems(($('pal-input') as HTMLInputElement).value);
  const all = [...items, ...cmds];
  palIndex = Math.max(0, Math.min(palIndex, all.length - 1));
  let html = '';
  if (items.length) html += `<li class="ph">Runs</li>` + items.map((it, i) => `<li><button class="${i === palIndex ? 'hl' : ''}" data-i="${i}">${it.glyph}<span><span class="key">${esc(it.key)}</span> ${esc(it.label)}</span><span class="trail">${esc(it.trail)}</span></button></li>`).join('');
  if (cmds.length) html += `<li class="ph">Commands</li>` + cmds.map((it, j) => { const i = items.length + j; return `<li><button class="${i === palIndex ? 'hl' : ''}" data-i="${i}">${it.glyph}<span>${esc(it.label)}</span><span class="trail">${esc(it.trail)}</span></button></li>`; }).join('');
  if (!all.length) html = `<li class="group-empty">Nothing matches.</li>`;
  $('pal-list').innerHTML = html;
}
function runPal(i: number): void {
  const { items, cmds } = palItems(($('pal-input') as HTMLInputElement).value);
  const it = [...items, ...cmds][i];
  if (!it) return;
  closePalette();
  if (it.kind === 'run') { const r = byId(it.id)!; select(it.id, { focusComposer: r.source === 'owned' && !!r.gate, focusList: !(r.source === 'owned' && r.gate) }); }
  else if (it.id === 'new') void openSheet();
  else if (it.id === 'next') { const r = grouped().needs[0]; if (r) select(r.id, { focusList: true }); else toast('Nothing is waiting on you'); }
  else if (it.id === 'theme') toggleTheme();
  else if (it.id === 'open') { if (selectedId) { void api.openInClaude(selectedId); toast('Opening in Claude Code'); } else toast('Select a run first'); }
  else if (it.id === 'unhide') { hidden.clear(); try { localStorage.removeItem('clearance-hidden'); } catch { /* ignore */ } render(); }
}
function openPalette(): void { palIndex = 0; $('palette').hidden = false; ($('pal-input') as HTMLInputElement).value = ''; renderPalette(); $('pal-input').focus(); }
function closePalette(): void { $('palette').hidden = true; }
$('btn-palette').addEventListener('click', openPalette);
$('palette').addEventListener('click', (e) => { if (e.target === $('palette')) closePalette(); const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]'); if (b) runPal(Number(b.dataset.i)); });
$('pal-input').addEventListener('input', () => { palIndex = 0; renderPalette(); });
$('pal-input').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); palIndex += 1; renderPalette(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); palIndex -= 1; renderPalette(); }
  else if (e.key === 'Enter') { e.preventDefault(); runPal(palIndex); }
  else if (e.key === 'Escape') closePalette();
});

/* Theme */
function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches);
}
function themeIcon(): void { $('btn-theme').innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-${isDark() ? 'sun' : 'moon'}"/></svg>`; }
function toggleTheme(): void {
  document.documentElement.dataset.theme = isDark() ? 'light' : 'dark';
  try { localStorage.setItem('clearance-theme', document.documentElement.dataset.theme!); } catch { /* ignore */ }
  themeIcon();
}
$('btn-theme').addEventListener('click', toggleTheme);
try { const t = localStorage.getItem('clearance-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch { /* ignore */ }
themeIcon();

/* Boot */
function applyRuns(next: Run[]): void {
  const previouslySelected = selectedId;
  runs = next;
  if (!selectedId || !byId(selectedId)) {
    const first = grouped().flat[0];
    selectedId = first ? first.id : null;
  }
  render();
  if (previouslySelected !== selectedId && selectedId) {
    document.querySelector('.row[aria-selected="true"]')?.classList.add('hl-run');
  }
}
api.onRuns(applyRuns);
api.onNotice((n) => { if (n.kind === 'focus-run' && n.id) select(n.id, { focusComposer: byId(n.id)?.source === 'owned', focusList: byId(n.id)?.source !== 'owned' }); });
void api.ready().then(applyRuns);
setInterval(render, 30000);
