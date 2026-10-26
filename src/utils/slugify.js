/**
 * Converts a string into a URL-friendly, lowercase kebab-case slug.
 *
 * @param {string} text - Raw string to slugify
 * @returns {string} Sanitized slug
 */
export function slugify(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    .toString()
    .toLowerCase()
    .trim()
    .normalize('NFD') // Normalize accented characters (e.g. é -> e)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric except space and hyphen
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with hyphen
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading and trailing hyphens
}
