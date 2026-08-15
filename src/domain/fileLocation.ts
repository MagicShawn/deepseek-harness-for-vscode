export interface FileLocation {
  path: string
  line?: number
  column?: number
}

function positive(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
}

export function parseFileLocation(rawValue: string): FileLocation | undefined {
  let value = rawValue.trim()
  if (value === '') return undefined

  if (/^file:\/\//iu.test(value)) {
    try {
      const url = new URL(value)
      const hash = url.hash
      value = decodeURIComponent(url.pathname)
      if (/^\/[A-Za-z]:\//u.test(value)) value = value.slice(1)
      const anchor = /^#L(\d+)(?::(\d+))?$/u.exec(hash)
      const line = positive(anchor?.[1])
      const column = positive(anchor?.[2])
      if (anchor !== null && line === undefined) return undefined
      return { path: value, ...(line !== undefined && { line }), ...(column !== undefined && { column }) }
    } catch {
      return undefined
    }
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/u.test(value) && !/^[A-Za-z]:[\\/]/u.test(value)) return undefined

  const anchor = /#L(\d+)(?::(\d+))?$/u.exec(value)
  if (anchor !== null) {
    value = value.slice(0, anchor.index)
    const line = positive(anchor[1])
    const column = positive(anchor[2])
    if (value === '' || line === undefined) return undefined
    return { path: value, line, ...(column !== undefined && { column }) }
  }

  const suffix = /:(\d+)(?::(\d+))?$/u.exec(value)
  if (suffix !== null) {
    const pathValue = value.slice(0, suffix.index)
    const line = positive(suffix[1])
    const column = positive(suffix[2])
    if (pathValue === '' || line === undefined) return undefined
    return { path: pathValue, line, ...(column !== undefined && { column }) }
  }

  return { path: value }
}
