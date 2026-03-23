import type { Journal, Page } from './types';

function sortedPages(journal: Journal): [number, Page][] {
  return Object.entries(journal.pages)
    .map(([k, v]) => [Number(k), v] as [number, Page])
    .sort((a, b) => a[0] - b[0]);
}

function pageTypeBadge(page: Page): string {
  const badges: Record<string, string> = {
    fact: '[Fact]',
    decision: '[Decision]',
    scenario: '[Scenario]',
    ending: '[Ending]',
  };
  return badges[page.type] || '';
}

export function exportJSON(journal: Journal): void {
  const data = JSON.stringify(journal, null, 2);
  download(`${slugify(journal.title)}.json`, data, 'application/json');
}

export function exportMarkdown(journal: Journal): void {
  let md = `# ${journal.title}\n\n`;

  if (journal.situation) {
    md += `> ${journal.situation}\n\n---\n\n`;
  }

  for (const [num, page] of sortedPages(journal)) {
    if (num === 0) continue;
    md += `## Page ${num} ${pageTypeBadge(page)}\n\n`;
    md += `${page.content}\n\n`;

    if (page.choices && page.choices.length > 0) {
      page.choices.forEach(c => {
        md += `- **${c.text}** → Page ${c.page}\n`;
      });
      md += '\n';
    }

    if (page.isEnding) {
      md += `*THE END*\n\n`;
    }

    if (page.confidence) {
      md += `_Confidence: ${page.confidence}_\n\n`;
    }

    md += '---\n\n';
  }

  download(`${slugify(journal.title)}.md`, md, 'text/markdown');
}

export function exportHTML(journal: Journal): void {
  let body = '';

  if (journal.situation) {
    body += `<blockquote>${esc(journal.situation)}</blockquote>`;
  }

  for (const [num, page] of sortedPages(journal)) {
    if (num === 0) continue;
    body += `<section id="page-${num}">`;
    body += `<h2>Page ${num} <small>${esc(pageTypeBadge(page))}</small></h2>`;
    body += page.content.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n');

    if (page.choices && page.choices.length > 0) {
      body += '<ul>';
      page.choices.forEach(c => {
        body += `<li><a href="#page-${c.page}"><strong>${esc(c.text)}</strong></a></li>`;
      });
      body += '</ul>';
    }

    if (page.isEnding) {
      body += `<p style="text-align:center;font-weight:bold;letter-spacing:2px;margin-top:24px;">THE END</p>`;
    }

    body += '</section><hr>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(journal.title)}</title>
  <style>
    body { max-width: 640px; margin: 40px auto; padding: 0 20px; font-family: Georgia, serif; font-size: 16px; line-height: 1.7; color: #2c1810; background: #f9f3e3; }
    h1 { text-align: center; font-size: 24px; letter-spacing: 1px; margin-bottom: 32px; }
    h2 { font-size: 18px; margin-top: 32px; }
    h2 small { font-size: 13px; color: #888; font-weight: normal; }
    blockquote { border-left: 3px solid #c41e1e; padding: 12px 16px; margin: 0 0 24px 0; color: #555; font-style: italic; }
    ul { padding-left: 20px; }
    li { margin-bottom: 6px; }
    a { color: #8b0000; }
    hr { border: none; border-top: 1px solid #ddd; margin: 32px 0; }
    section { margin-bottom: 16px; }
  </style>
</head>
<body>
  <h1>${esc(journal.title)}</h1>
  ${body}
</body>
</html>`;

  download(`${slugify(journal.title)}.html`, html, 'text/html');
}

export function exportPDF(journal: Journal): void {
  // Generate HTML and open in a new window for printing to PDF
  let body = '';

  if (journal.situation) {
    body += `<blockquote>${esc(journal.situation)}</blockquote>`;
  }

  for (const [num, page] of sortedPages(journal)) {
    if (num === 0) continue;
    body += `<section>`;
    body += `<h2>Page ${num} <small>${esc(pageTypeBadge(page))}</small></h2>`;
    body += page.content.split('\n\n').map(p => `<p>${esc(p)}</p>`).join('\n');

    if (page.choices && page.choices.length > 0) {
      body += '<ul>';
      page.choices.forEach(c => {
        body += `<li><strong>${esc(c.text)}</strong> → Page ${c.page}</li>`;
      });
      body += '</ul>';
    }

    if (page.isEnding) {
      body += `<p style="text-align:center;font-weight:bold;letter-spacing:2px;margin-top:24px;">THE END</p>`;
    }

    body += '</section><hr>';
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${esc(journal.title)}</title>
  <style>
    body { max-width: 640px; margin: 40px auto; padding: 0 20px; font-family: Georgia, serif; font-size: 14px; line-height: 1.7; color: #222; }
    h1 { text-align: center; font-size: 22px; letter-spacing: 1px; margin-bottom: 32px; }
    h2 { font-size: 16px; margin-top: 24px; }
    h2 small { font-size: 12px; color: #888; font-weight: normal; }
    blockquote { border-left: 3px solid #c41e1e; padding: 8px 12px; margin: 0 0 20px 0; color: #555; font-style: italic; }
    ul { padding-left: 20px; }
    li { margin-bottom: 4px; }
    hr { border: none; border-top: 1px solid #ddd; margin: 24px 0; }
    @media print { body { margin: 0; } hr { page-break-after: auto; } }
  </style>
</head>
<body>
  <h1>${esc(journal.title)}</h1>
  ${body}
  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
  }
}

function download(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export';
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
