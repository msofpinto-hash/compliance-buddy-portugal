import React from "react";

/**
 * Highlights occurrences of a search term within a text string.
 * Returns a React node with highlighted spans.
 */
export function highlightText(
  text: string | null | undefined,
  searchTerm: string,
  highlightClassName: string = "bg-yellow-200 text-yellow-900 rounded px-0.5"
): React.ReactNode {
  if (!text || !searchTerm.trim()) {
    return text || null;
  }

  const searchLower = searchTerm.toLowerCase().trim();
  const textLower = text.toLowerCase();
  
  // If search term is not found, return the original text
  if (!textLower.includes(searchLower)) {
    return text;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let matchIndex = textLower.indexOf(searchLower, lastIndex);
  let key = 0;

  while (matchIndex !== -1) {
    // Add text before the match
    if (matchIndex > lastIndex) {
      parts.push(text.slice(lastIndex, matchIndex));
    }

    // Add the highlighted match (using original case from text)
    const matchedText = text.slice(matchIndex, matchIndex + searchTerm.length);
    parts.push(
      <mark key={key++} className={highlightClassName}>
        {matchedText}
      </mark>
    );

    lastIndex = matchIndex + searchTerm.length;
    matchIndex = textLower.indexOf(searchLower, lastIndex);
  }

  // Add remaining text after last match
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <>{parts}</>;
}
