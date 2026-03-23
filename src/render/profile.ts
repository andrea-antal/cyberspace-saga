import { esc, escAttr } from '../util';
import { resolveProfile } from '../cloud';

export function renderProfile($page: HTMLElement, username: string): void {
  $page.innerHTML = '<div style="text-align:center;padding:60px 20px;color:var(--text-light);font-size:16px;">Loading profile...</div>';
  fetchProfile($page, username);
}

async function fetchProfile($page: HTMLElement, username: string): Promise<void> {
  try {
    const { profile, stories, totalLikes } = await resolveProfile(username);

    let html = '<div style="max-width:500px;margin:0 auto;">';

    // Header: avatar + name + username
    html += '<div style="text-align:center;margin-bottom:24px;">';
    if (profile.avatar) {
      html += `<img src="${escAttr(profile.avatar)}" alt="" style="width:80px;height:80px;border-radius:50%;object-fit:cover;margin-bottom:12px;">`;
    }
    html += `<div style="font-size:20px;font-weight:bold;color:var(--text);">${esc(profile.displayName)}</div>`;
    html += `<div style="font-size:14px;color:var(--text-light);margin-top:2px;">@${esc(profile.username)}</div>`;

    // Stats
    html += `<div style="display:flex;justify-content:center;gap:24px;margin-top:12px;font-size:14px;color:var(--text-light);">`;
    html += `<span>${stories.length} ${stories.length === 1 ? 'story' : 'stories'}</span>`;
    html += `<span>&#9829; ${totalLikes}</span>`;
    html += '</div>';
    html += '</div>';

    // Bio
    if (profile.bio) {
      html += `<div style="font-size:15px;line-height:1.5;color:var(--text);margin-bottom:20px;text-align:center;">${esc(profile.bio)}</div>`;
    }

    // Links
    if (profile.links && profile.links.length > 0) {
      html += '<div style="display:flex;justify-content:center;gap:16px;margin-bottom:28px;flex-wrap:wrap;">';
      for (const link of profile.links) {
        if (!link || !/^https?:\/\//i.test(link)) continue;
        const display = linkDisplay(link);
        html += `<a href="${escAttr(link)}" target="_blank" rel="noopener noreferrer" style="font-size:14px;color:var(--text-light);text-decoration:underline;">${esc(display)}</a>`;
      }
      html += '</div>';
    }

    // Stories
    if (stories.length > 0) {
      html += '<div style="border-top:1px solid var(--cream-dark);padding-top:20px;">';
      html += '<div style="font-size:14px;font-weight:bold;color:var(--text-light);margin-bottom:12px;">Published Stories</div>';
      stories.forEach((story, i) => {
        html += `<a href="/${escAttr(story.slug)}" style="text-decoration:none;color:inherit;display:flex;align-items:center;gap:12px;padding:10px 0;${i < stories.length - 1 ? 'border-bottom:1px solid var(--cream-dark);' : ''}">`;
        html += `<div style="flex:1;font-size:15px;font-weight:bold;color:var(--text);">${esc(story.title)}</div>`;
        html += `<span style="font-size:14px;color:var(--text-light);">&#9829; ${story.likes}</span>`;
        html += '</a>';
      });
      html += '</div>';
    } else {
      html += '<div style="text-align:center;font-size:14px;color:var(--text-light);padding:20px 0;">No published stories yet.</div>';
    }

    html += '</div>';
    $page.innerHTML = html;
  } catch {
    $page.innerHTML = `<div style="text-align:center;padding:60px 20px;">
      <div style="font-size:16px;color:var(--text);margin-bottom:12px;">Profile not found</div>
      <div style="font-size:14px;color:var(--text-light);margin-bottom:16px;">This creator doesn't exist or hasn't set up a profile yet.</div>
      <button class="btn btn-primary btn-small" data-action="go-shelf">Go to Shelf</button>
    </div>`;
  }
}

function linkDisplay(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 30);
  }
}
