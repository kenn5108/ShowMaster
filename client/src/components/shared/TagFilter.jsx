import React from 'react';

/**
 * TagFilter — reusable tag filter bar.
 *
 * Props:
 *  - items: array of objects, each with a `tags` field (JSON string or array)
 *  - selectedTags: Set of currently selected tag strings
 *  - onToggleTag: (tag) => void
 *  - onClear: () => void
 */
export default function TagFilter({ items, selectedTags, onToggleTag, onClear }) {
  // Collect all unique tags from items
  const allTags = React.useMemo(() => {
    const tagSet = new Set();
    for (const item of items) {
      const tags = parseTags(item.tags);
      for (const t of tags) tagSet.add(t);
    }
    // Sort alphabetically
    return [...tagSet].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  if (allTags.length === 0) return null;

  return (
    <div className="tag-filter-bar">
      {allTags.map(tag => (
        <button
          key={tag}
          className={`tag-filter-chip ${selectedTags.has(tag) ? 'active' : ''}`}
          onClick={() => onToggleTag(tag)}
        >
          {tag}
        </button>
      ))}
      {selectedTags.size > 0 && (
        <button className="tag-filter-clear" onClick={onClear}>
          Effacer filtres
        </button>
      )}
    </div>
  );
}

/**
 * Filter items by selected tags (AND logic).
 * Returns items that have ALL selected tags.
 */
export function filterByTags(items, selectedTags) {
  if (selectedTags.size === 0) return items;
  return items.filter(item => {
    const tags = parseTags(item.tags);
    for (const st of selectedTags) {
      if (!tags.includes(st)) return false;
    }
    return true;
  });
}

function parseTags(tags) {
  if (Array.isArray(tags)) return tags;
  if (typeof tags === 'string') {
    try { return JSON.parse(tags); } catch { return []; }
  }
  return [];
}
