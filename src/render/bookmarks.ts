import { viewState, getJournal, persist, BM_COLORS } from '../state';
import { render } from '../main';

export function renderBookmarks($bookmarks: HTMLElement): void {
  const j = getJournal();
  if (!j || viewState.view === 'shelf' || viewState.view === 'settings') {
    $bookmarks.innerHTML = '';
    return;
  }
  if (!j.bookmarks || j.bookmarks.length === 0) {
    $bookmarks.innerHTML = '';
    return;
  }

  let html = '';
  j.bookmarks.forEach((pageNum, i) => {
    const isActive = viewState.view === 'page' && viewState.currentPage === pageNum;
    html += `<div class="bookmark-tab bm-color-${i % BM_COLORS} ${isActive ? 'active' : ''}"
      data-action="go-page" data-page="${pageNum}" title="Page ${pageNum}">
      ${pageNum}
      <span class="remove-bm" data-action="remove-bookmark" data-page="${pageNum}">&times;</span>
    </div>`;
  });
  $bookmarks.innerHTML = html;
}

export function addBookmark(pageNum: number): void {
  const j = getJournal();
  if (!j) return;
  if (!j.bookmarks) j.bookmarks = [];
  if (j.bookmarks.includes(pageNum)) return;
  if (j.bookmarks.length >= BM_COLORS) return;
  j.bookmarks.push(pageNum);
  persist();
  render();
}

export function removeBookmark(pageNum: number): void {
  const j = getJournal();
  if (!j || !j.bookmarks) return;
  j.bookmarks = j.bookmarks.filter(b => b !== pageNum);
  persist();
  render();
}
