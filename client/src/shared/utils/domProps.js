/**
 * Pure utility to omit specific properties from an object (e.g., stripping unsupported
 * styling escape hatches like className and style before forwarding to native DOM nodes).
 *
 * Preserves all other valid props (id, title, aria-*, data-*, event handlers, etc.).
 *
 * @param {object} props - Input props object
 * @param {string[]} [keysToOmit=['className', 'style']] - Keys to omit
 * @returns {object} Clean copy of props without the omitted keys
 */
export function omitProps(props, keysToOmit = ['className', 'style']) {
  if (!props || typeof props !== 'object') return {};
  const result = { ...props };
  for (let i = 0; i < keysToOmit.length; i += 1) {
    delete result[keysToOmit[i]];
  }
  return result;
}
