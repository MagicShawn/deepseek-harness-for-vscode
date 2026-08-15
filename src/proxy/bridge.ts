export function injectBridge(html: string, scriptTag: string): string {
  const closingHead = html.search(/<\/head\s*>/iu)
  if (closingHead >= 0) return `${html.slice(0, closingHead)}${scriptTag}${html.slice(closingHead)}`

  const openingHtml = /<html(?:\s[^>]*)?>/iu.exec(html)
  if (openingHtml !== null && openingHtml.index !== undefined) {
    const insertAt = openingHtml.index + openingHtml[0].length
    return `${html.slice(0, insertAt)}<head>${scriptTag}</head>${html.slice(insertAt)}`
  }
  return `<head>${scriptTag}</head>${html}`
}
