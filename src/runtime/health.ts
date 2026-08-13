import type { HealthProbe } from './manager.js'

export const probeHarness: HealthProbe = async (url, signal) => {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'manual', signal })
    return response.status >= 200 && response.status < 500
  } catch {
    return false
  }
}
