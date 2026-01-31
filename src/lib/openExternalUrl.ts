/**
 * Opens an external URL without sending the Referer header.
 * This is necessary for sites like DRE (diariodarepublica.pt) that block
 * requests with external referrers.
 * 
 * Uses multiple techniques to ensure no referrer is sent:
 * 1. Opens about:blank first, then navigates from there
 * 2. Uses rel="noreferrer" which is stronger than noopener
 */
export function openExternalUrl(url: string): void {
  if (!url) return;

  // NOTE: In the preview, the app can run inside a sandboxed iframe.
  // Navigating a popup AFTER opening it (about:blank -> set location) can throw SecurityError.
  // Opening the final URL directly is more reliable.
  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      // Best-effort: ensure no opener
      try {
        opened.opener = null;
      } catch {
        // ignore
      }
      return;
    }
  } catch {
    // ignore and fallback
  }

  // Fallback: Create a link with all possible no-referrer attributes
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noreferrer noopener'; // noreferrer is stronger
  link.referrerPolicy = 'no-referrer';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Props to apply to anchor elements for external links.
 * Use spread operator: <a {...externalLinkProps} href={url}>
 * 
 * Note: For maximum compatibility with sites that block referrers (like DRE),
 * consider using openExternalUrl() function instead of anchor links.
 */
export const externalLinkProps = {
  target: '_blank' as const,
  rel: 'noreferrer noopener',  // noreferrer before noopener is important
  referrerPolicy: 'no-referrer' as const,
};
