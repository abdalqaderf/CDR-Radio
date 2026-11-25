function eligibleOrigin(value, httpsOnly = false) {
  if (!value) return null
  try {
    const url = new URL(value)
    const validProtocol = url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:')
    return validProtocol && value === url.origin ? value : null
  } catch {
    return null
  }
}

export function webAccess(request, development, deployed) {
  const configuredOrigins = [eligibleOrigin(development), eligibleOrigin(deployed, true)].filter(Boolean)
  const origin = request.headers.get('Origin')
  const approved = configuredOrigins.includes(origin)
  return {
    configured: configuredOrigins.length > 0,
    allowed: origin === null || approved,
    headers: {
      'Cache-Control': 'no-store',
      Vary: 'Origin',
      ...(approved ? { 'Access-Control-Allow-Origin': origin } : {}),
    },
  }
}
