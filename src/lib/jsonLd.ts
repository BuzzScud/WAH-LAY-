/**
 * Safe serialisation for `<script type="application/ld+json">` blocks.
 *
 * JSON.stringify does NOT escape `<`, so any database string containing
 * `</script>` closes the tag early and everything after it is parsed as HTML.
 * The store name, address, category names and dish names all reach the JSON-LD
 * block, so this is a live injection sink, not a hypothetical one - a dish
 * named `x</script><script>...</script>` executes on the public home page.
 *
 * Escaping `<` as \u003c is still valid JSON and still valid JSON-LD: the
 * parser turns it back into `<`, but the HTML tokenizer never sees a tag.
 * `&` gets the same treatment so the payload cannot be reassembled through
 * HTML entity decoding, and U+2028/U+2029 because they terminate lines in
 * JavaScript even though JSON permits them raw.
 */
export function jsonLdScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
