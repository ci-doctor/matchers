const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escape text for an HTML text node or a double-quoted attribute. */
export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ENTITIES[c]);
