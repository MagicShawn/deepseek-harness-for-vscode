const URL_PATTERN = /https?:\/\/[^\s<>'"]+/giu

export function parseHarnessUrl(line: string): string | undefined {
  for (const match of line.matchAll(URL_PATTERN)) {
    try {
      const url = new URL(match[0])
      const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]'
      if (!loopback || url.username !== '' || url.password !== '') continue
      return url.href
    } catch {
      continue
    }
  }
  return undefined
}
