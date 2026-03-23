const escDiv = document.createElement('div');

export function esc(s: string): string {
  if (!s) return '';
  escDiv.textContent = s;
  return escDiv.innerHTML;
}

export function escAttr(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s-]/g, '').replace(/[\s]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
