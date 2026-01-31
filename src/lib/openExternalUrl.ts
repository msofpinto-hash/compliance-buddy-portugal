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
  
  // Technique: Open a blank window first, then set its location
  // This breaks the referrer chain completely
  const newWindow = window.open('about:blank', '_blank');
  if (newWindow) {
    newWindow.opener = null; // Break the opener link
    newWindow.location.href = url;
  } else {
    // Fallback: Create a link with all possible no-referrer attributes
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noreferrer noopener';  // noreferrer is stronger
    link.referrerPolicy = 'no-referrer';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
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
