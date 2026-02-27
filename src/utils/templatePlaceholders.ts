/**
 * Replaces all placeholder spans in HTML with their corresponding values.
 * Placeholders are stored as: <span data-placeholder="key" ...>{{key}}</span>
 */
export function replacePlaceholders(
  html: string,
  values: Record<string, string>
): string {
  return html.replace(
    /<span[^>]*data-placeholder="([^"]+)"[^>]*>.*?<\/span>/g,
    (_match, key: string) => values[key] || `[${key}]`
  );
}
