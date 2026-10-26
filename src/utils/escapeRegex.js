/**
 * Escapes special regex characters in a user-provided string to prevent regex injection or ReDoS.
 *
 * @param {string} str - Raw user search string
 * @returns {string} Escaped string safe for new RegExp()
 */
export function escapeRegex(str) {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
