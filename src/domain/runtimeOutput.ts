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

export function redactRuntimeLog(line: string): string {
  const withoutUrlSecrets = line.replace(URL_PATTERN, raw => {
    try {
      const url = new URL(raw)
      if (url.username !== '' || url.password !== '') {
        url.username = ''
        url.password = ''
      }
      for (const key of url.searchParams.keys()) url.searchParams.set(key, '[REDACTED]')
      return url.href
    } catch {
      return '[REDACTED URL]'
    }
  })
  return withoutUrlSecrets.replace(
    /\b(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\b\s*[:=]\s*[^;\r\n]*/giu,
    '$1: [REDACTED]',
  )
}
