import { viewState, getJournal, isOwnJournal, canDelete } from '../state';
import { render } from '../main';
import { esc } from '../util';
import type { Page } from '../types';

export function renderMap($page: HTMLElement): void {
  const j = getJournal();
  if (!j) { viewState.view = 'shelf'; render(); return; }

  let html = `<div style="font-size:13.5pt;font-weight:bold;margin-bottom:14px;">${esc(j.title)}</div>`;
  html += '<div class="map-view">';

  const visited = new Set<number>();

  function renderTree(pageNum: number, depth: number): void {
    if (visited.has(pageNum)) {
      html += `<div class="map-line" style="padding-left:${depth * 20}px" data-action="go-page" data-page="${pageNum}">p.${pageNum} (see above)</div>`;
      return;
    }
    visited.add(pageNum);
    const pg = j!.pages[pageNum];
    if (!pg) return;
    const preview = pg.content ? pg.content.slice(0, 50) + (pg.content.length > 50 ? '...' : '') : '(blank)';
    const cls = pg.content ? 'has-content' : 'empty-page';
    const ending = pg.isEnding ? ' <span class="map-ending">THE END</span>' : '';
    const typeClass = pg.type ? ` map-type-${pg.type}` : '';
    const lineStyle = pg.type === 'scenario' ? 'border-left: 2px dashed var(--cream-dark);' : '';

    html += `<div class="map-line ${cls}${typeClass}" style="padding-left:${depth * 20}px;${lineStyle}" data-action="go-page" data-page="${pageNum}">`;
    html += `<strong>p.${pageNum}</strong> &mdash; ${esc(preview)}${ending}</div>`;
    if (pg.choices) {
      pg.choices.forEach(c => {
        html += `<div style="padding-left:${(depth + 1) * 20}px;font-size:13px;color:var(--text-light);margin:2px 0;">&darr; "${esc(c.text)}"</div>`;
        renderTree(c.page, depth + 1);
      });
    }
  }
  renderTree(1, 0);

  // Orphan pages
  const allPages = Object.keys(j.pages).map(Number).sort((a, b) => a - b);
  const orphans = allPages.filter(p => !visited.has(p));
  if (orphans.length > 0) {
    html += '<div style="margin-top:18px;font-size:13px;color:var(--text-light);border-top:1px solid var(--cream-dark);padding-top:12px;">Unreachable pages:</div>';
    orphans.forEach(p => {
      const pg = j.pages[p];
      const preview = pg.content ? pg.content.slice(0, 50) : '(blank)';
      html += `<div class="map-line empty-page" style="padding-left:0" data-action="go-page" data-page="${p}"><strong>p.${p}</strong> &mdash; ${esc(preview)}</div>`;
    });
  }

  html += '</div>';

  html += '<div style="display:flex;gap:12px;justify-content:center;margin-top:20px;">';
  if (isOwnJournal(j.id)) {
    html += `<button class="btn btn-small" style="font-size:12pt;" data-action="share-journal" data-id="${j.id}">Share</button>`;
  }
  if (canDelete(j.id)) {
    html += `<button class="btn btn-small btn-danger" style="font-size:12pt;border-color:var(--cream-shadow);" data-action="delete-journal" data-id="${j.id}">Delete</button>`;
  }
  html += '</div>';

  $page.innerHTML = html;
}
