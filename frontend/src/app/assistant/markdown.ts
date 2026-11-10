const ESCAPED_MARKDOWN = /\\([\\`*_{}\[\]()#+\-.!>])/g;

function unescapeMarkdown(value: string): string {
  return value.replace(ESCAPED_MARKDOWN, '$1');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inlineMarkdown(value: string): string {
  return value
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>');
}

/**
 * Converts the small Markdown subset used by the assistant into safe HTML.
 * The input is escaped before any tags are generated.
 */
export function markdownToHtml(source: string): string {
  const lines = escapeHtml(unescapeMarkdown(source.trim())).split(/\r?\n/);
  const parts: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length > 0) {
      parts.push(`<p>${paragraph.join('<br>')}</p>`);
      paragraph = [];
    }
  };

  const closeList = (): void => {
    if (listType) {
      parts.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      closeList();
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.+)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);

    if (bullet || numbered) {
      flushParagraph();
      const nextListType = bullet ? 'ul' : 'ol';

      if (listType && listType !== nextListType) {
        closeList();
      }

      if (!listType) {
        parts.push(`<${nextListType}>`);
        listType = nextListType;
      }

      parts.push(`<li>${inlineMarkdown((bullet ?? numbered)![1])}</li>`);
      continue;
    }

    closeList();
    paragraph.push(inlineMarkdown(trimmed));
  }

  flushParagraph();
  closeList();

  return parts.join('');
}
