export type AudioState = 'idle' | 'connecting' | 'playing' | 'buffering' | 'retry' | 'failed' | 'gesture'

// One listening session owns its audio element, timeouts and retry budget.
export function startPlayback(
  url: string,
  finite: boolean,
  getPreferences: () => { muted: boolean; volume: number; canSetVolume: boolean },
  onState: (state: AudioState) => void,
) {
  let stopped = false,
    retries = 0
  let element: HTMLAudioElement | null = null
  let retryTimer: ReturnType<typeof setTimeout>, watchdog: ReturnType<typeof setTimeout> | undefined
  function applyPreferences() {
    if (!element) return
    const prefs = getPreferences()
    element.muted = prefs.muted
    if (prefs.canSetVolume) element.volume = prefs.volume
  }
  function release() {
    clearTimeout(watchdog)
    watchdog = undefined
    if (!element) return
    element.onplaying = element.onended = element.onerror = element.onwaiting = element.onstalled = null
    element.ontimeupdate = null
    element.pause()
    element.removeAttribute('src')
    element.load()
    element = null
  }
  function connect() {
    if (stopped) return
    const audio = new Audio()
    element = audio
    let recoveryPosition: number | undefined
    function failed() {
      if (element !== audio || stopped) return
      release()
      if (retries >= 3) {
        onState('failed')
        return
      }
      onState('retry')
      retryTimer = setTimeout(connect, 1000 * 2 ** retries++)
    }
    function watchProgress() {
      if (element !== audio || watchdog !== undefined) return
      const position = audio.currentTime
      watchdog = setTimeout(() => {
        watchdog = undefined
        if (element !== audio) return
        if (audio.currentTime <= position) failed()
        else watchProgress()
      }, 10000)
    }
    audio.onplaying = () => {
      if (element === audio) {
        clearTimeout(watchdog)
        watchdog = undefined
        if (retries > 0) recoveryPosition = audio.currentTime
        onState('playing')
      }
    }
    audio.ontimeupdate = () => {
      if (element !== audio || recoveryPosition === undefined) return
      // Give a later outage its own retry budget after sustained playback resumes.
      if (audio.currentTime - recoveryPosition >= 30) {
        retries = 0
        recoveryPosition = undefined
      }
    }
    audio.onwaiting = () => {
      if (element !== audio) return
      recoveryPosition = undefined
      onState('buffering')
      watchProgress()
    }
    audio.onstalled = watchProgress
    audio.onerror = failed
    audio.onended = () => {
      if (!finite) failed()
      else {
        release()
        onState('idle')
      }
    }
    applyPreferences()
    audio.src = url
    onState('connecting')
    watchProgress()
    void audio.play().catch((e: unknown) => {
      if (element !== audio || stopped) return
      if (e instanceof DOMException && e.name === 'NotAllowedError') {
        release()
        onState('gesture')
      } else failed()
    })
  }
  connect()
  return {
    applyPreferences,
    stop() {
      stopped = true
      clearTimeout(retryTimer)
      release()
    },
  }
}
