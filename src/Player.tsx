import { useEffect, useRef, useState } from 'react'
import { AudioLines, ListMusic, Play, RadioTower, Square, Volume2, VolumeX } from 'lucide-react'
import { ammanDate, mode, stationApi, type Station } from './radio'

import { startPlayback, type AudioState } from './playback'
const labels: Record<AudioState, string> = {
  idle: 'متوقف على هذا الجهاز',
  connecting: 'جارٍ الاتصال',
  playing: 'قيد التشغيل على هذا الجهاز',
  buffering: 'بانتظار وصول الصوت',
  retry: 'جارٍ إعادة الاتصال',
  failed: 'انقطع الصوت. اضغط تشغيل للمحاولة.',
  gesture: 'اضغط تشغيل للسماح بالصوت.',
}

export function Player({ monitor = false }: { monitor?: boolean }) {
  const [station, setStation] = useState<Station | null>(null)
  const [fresh, setFresh] = useState(false)
  const [loading, setLoading] = useState(mode !== 'disconnected')
  const [status, setStatus] = useState<AudioState>('idle')
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0.7)
  const [volumeControl, setVolumeControl] = useState(false)
  const session = useRef<ReturnType<typeof startPlayback> | null>(null)
  const preferences = useRef({ muted, volume, canSetVolume: volumeControl })
  const url = station?.url
  useEffect(() => {
    if (mode === 'disconnected') return
    let disposed = false,
      fetching = false
    async function refresh() {
      if (document.hidden || fetching) return
      fetching = true
      try {
        const value = await stationApi.snapshot()
        if (!disposed) {
          setStation(value)
          setFresh(true)
        }
      } catch {
        if (!disposed) setFresh(false)
      } finally {
        if (!disposed) setLoading(false)
        fetching = false
      }
    }
    void refresh()
    const timer = window.setInterval(refresh, 30000)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      disposed = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])
  useEffect(() => {
    if (!station) return
    const expires = Math.min(station.checked + 60000, station.trackEndsAt ?? Infinity)
    const timer = window.setTimeout(() => setFresh(false), Math.max(0, expires - Date.now()))
    return () => window.clearTimeout(timer)
  }, [station])
  useEffect(() => {
    const probe = new Audio()
    // A volume-locked browser can echo a write briefly without applying it or firing volumechange.
    probe.onvolumechange = () => setVolumeControl(Math.abs(probe.volume - 0.4) < 0.01)
    try {
      probe.volume = 0.4
    } catch {
      probe.onvolumechange = null
    }
    return () => { probe.onvolumechange = null }
  }, [])
  useEffect(() => {
    preferences.current = { muted, volume, canSetVolume: volumeControl }
    session.current?.applyPreferences()
  }, [muted, volume, volumeControl])
  useEffect(() => {
    setStatus('idle')
    return () => {
      session.current?.stop()
      session.current = null
    }
  }, [url])
  function start() {
    if (!url) return
    session.current?.stop()
    session.current = startPlayback(url, mode === 'fixture', () => preferences.current, setStatus)
  }
  function stop() {
    session.current?.stop()
    session.current = null
    setStatus('idle')
  }
  const running = ['connecting', 'playing', 'buffering', 'retry'].includes(status)
  const online = station && station.online !== false
  const localStatus = running || online ? labels[status] : loading ? 'جارٍ التحقق من المحطة…' : 'البث غير متصل'
  const Heading = monitor ? 'h2' : 'h1'
  return (
    <div className={monitor ? 'player-stack player-monitor' : 'player-stack'}>
      <section className="receiver" aria-labelledby="station-title">
        <div className="receiver-body">
          <span className="broadcast-label"><RadioTower size={17} aria-hidden="true" /> {mode === 'fixture' ? 'عينة محلية' : 'إذاعة غماس بلدي'}</span>
          <Heading id="station-title">{monitor ? 'مراقبة بث المحطة' : 'مشغّل الفرع'}</Heading>
          <p>
            {mode === 'fixture'
              ? 'معاينة محلية لمقطع اختباري مدته ست ثوانٍ.'
              : 'استمع إلى البث الموحّد لفروع غماس بلدي.'}
          </p>
          <div className="controls">
            {running ? (
              <button className="play" onClick={stop} key="stop"><Square size={19} aria-hidden="true" /> إيقاف</button>
            ) : (
              <button className="play" disabled={!url} onClick={start} key="start">
                <Play size={19} aria-hidden="true" /> {mode === 'fixture' ? 'تشغيل العينة' : 'تشغيل البث'}
              </button>
            )}
            <button aria-pressed={muted} onClick={() => setMuted(!muted)}>
              {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}{' '}
              {muted ? 'إلغاء الكتم' : 'كتم الصوت'}
            </button>
          </div>
          <div className="status" role="status" data-state={status}>{localStatus}</div>
          {volumeControl ? (
            <label className="volume">
              مستوى الصوت
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
              />
            </label>
          ) : (
            <p className="volume-hint">اضبط مستوى الصوت من أزرار الجهاز.</p>
          )}
        </div>
        <div className="signal-art" aria-hidden="true">
          <div className="signal-arch"><div className="signal-ring"><AudioLines strokeWidth={1.4} /></div></div>
        </div>
      </section>
      <section className="state-panel now-card" aria-label="معلومات محطة البث">
        <div className="now-track">
          <span className="tile-icon"><ListMusic size={23} aria-hidden="true" /></span>
          <div><h2>المقطع الحالي على المحطة</h2>
            <p dir="auto">{station?.current || 'لا توجد معلومات عن المقطع حاليًا.'}</p></div>
        </div>
        {station?.next && <div className="next-track"><span>التالي على المحطة</span><p dir="auto">{station.next}</p></div>}
        {station && (
          <p className="muted now-update">
            آخر تحديث · {ammanDate(station.checked)} {!fresh && ' · معلومات قديمة'}
          </p>
        )}
      </section>
      <p className="local-note">الإيقاف والكتم ومستوى الصوت تخص هذا الجهاز.</p>
    </div>
  )
}
