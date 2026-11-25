const categories = new Set(['music', 'quran', 'welcome'])

export function dailyCandidate(playlist) {
  return playlist.is_enabled && playlist.type === 'default' && playlist.source === 'songs' &&
    Number(playlist.num_songs) > 0 && playlist.schedule_items?.length === 0
}

export function protectedDaily(playlist, configuredIds = []) {
  return configuredIds.includes(String(playlist.id)) || dailyCandidate(playlist)
}

export function mediaLabels(title, path) {
  const name = String(path || '').split('/').pop()
  const generated = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}-/i
  const label = String(title || name).replace(generated, '')
  const tagged = /^(?:[a-f\d-]{36}-)?CDR-(music|quran|welcome)-(.+)\.mp3$/iu.exec(name)
  if (tagged && categories.has(tagged[1].toLowerCase()))
    return { title: tagged[2], category: tagged[1].toLowerCase() }
  if (/CDR-Phase0|CDR-spoken|a-low-single|b-high-double|at-limit|boundary|test-marker/iu.test(name))
    return { title: label, category: 'diagnostic' }
  return { title: label }
}
