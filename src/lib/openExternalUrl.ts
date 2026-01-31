/**
 * Opens an external URL without sending the Referer header.
 * This is necessary for sites like DRE (diariodarepublica.pt) that block
 * requests with external referrers.
 * 
 * The function creates a temporary anchor element with referrerpolicy="no-referrer"
 * to ensure the browser doesn't send the Referer header when navigating.
 */
export function openExternalUrl(url: string): void {
  if (!url) return;
  
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.referrerPolicy = 'no-referrer';
  
  // Append, click, and remove to trigger the navigation
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Props to apply to anchor elements for external links.
 * Use spread operator: <a {...externalLinkProps} href={url}>
 */
export const externalLinkProps = {
  target: '_blank' as const,
  rel: 'noopener noreferrer',
  referrerPolicy: 'no-referrer' as const,
};
