import { esc } from '../util';
import { getLeaderboard, getFeaturedStories } from '../cloud';

type LeaderboardEntry = { journalId: string; likes: number; title: string; slug: string | null; creatorUsername: string | null };

export function renderLeaderboard($page: HTMLElement): void {
  let html = '<div class="page-number" style="margin-bottom:16px;">&mdash; Top Stories &mdash;</div>';
  html += '<div id="leaderboard-content" style="text-align:center;padding:20px 0;color:var(--text-light);font-size:14px;">Loading...</div>';
  $page.innerHTML = html;

  fetchLeaderboard();
}

function renderEntryList(entries: LeaderboardEntry[], ranked: boolean): string {
  let html = '<div style="text-align:left;">';
  entries.forEach((entry, i) => {
    const linkOpen = entry.slug
      ? `<a href="/${entry.slug}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;flex:1;">`
      : '<div style="display:flex;align-items:center;gap:12px;flex:1;">';
    const linkClose = entry.slug ? '</a>' : '</div>';
    html += `<div style="display:flex;align-items:center;gap:12px;padding:10px 0;${i < entries.length - 1 ? 'border-bottom:1px solid var(--cream-dark);' : ''}${entry.slug ? 'cursor:pointer;' : ''}">`;
    html += linkOpen;
    if (ranked) {
      html += `<span style="font-size:16px;font-weight:bold;color:var(--text-light);min-width:24px;text-align:right;">${i + 1}</span>`;
    }
    html += '<div style="flex:1;">';
    html += `<div style="font-size:14px;font-weight:bold;color:var(--text);">${esc(entry.title)}</div>`;
    if (entry.creatorUsername) {
      html += `<a href="/@${esc(entry.creatorUsername)}" style="font-size:12px;color:var(--text-light);text-decoration:none;">@${esc(entry.creatorUsername)}</a>`;
    }
    html += '</div>';
    html += linkClose;
    html += `<span style="font-size:14px;color:var(--text-light);">&#9829; ${entry.likes}</span>`;
    html += `</div>`;
  });
  html += '</div>';
  return html;
}

async function fetchLeaderboard(): Promise<void> {
  const container = document.getElementById('leaderboard-content');
  if (!container) return;

  try {
    const [leaderboardData, featuredData] = await Promise.all([
      getLeaderboard(),
      getFeaturedStories().catch(() => ({ entries: [] })),
    ]);

    const { entries } = leaderboardData;
    const featured = featuredData.entries;

    let html = '';

    // Featured Stories section
    if (featured.length > 0) {
      html += '<div style="margin-bottom:24px;">';
      html += '<div class="page-number" style="margin-bottom:12px;font-size:14px;">&mdash; Featured Stories &mdash;</div>';
      html += renderEntryList(featured, false);
      html += '</div>';
    }

    // Top Stories section
    if (entries.length === 0 && featured.length === 0) {
      html += '<div style="font-size:14px;color:var(--text-light);padding:20px 0;">No stories have been liked yet. Be the first to share and get likes!</div>';
    } else if (entries.length > 0) {
      if (featured.length > 0) {
        html += '<div class="page-number" style="margin-bottom:12px;font-size:14px;">&mdash; Top Stories &mdash;</div>';
      }
      html += renderEntryList(entries, true);
    }

    container.innerHTML = html;
  } catch {
    container.innerHTML = '<div style="font-size:14px;color:var(--text-light);">Failed to load leaderboard.</div>';
  }
}
