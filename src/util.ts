const escDiv = document.createElement('div');

export function esc(s: string): string {
  if (!s) return '';
  escDiv.textContent = s;
  return escDiv.innerHTML;
}

export function escAttr(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
