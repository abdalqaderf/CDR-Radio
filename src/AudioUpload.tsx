import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { categories, count } from './PlaylistControls'
import { message, mode, stationApi, validateUpload, type Track } from './radio'

type UploadItem = {
  key: string
  file: File
  title: string
  prepared?: File
  state: 'queued' | 'uploading' | 'processing' | 'ready' | 'failed' | 'unconfirmed'
  progress?: number
  issue?: string
}

export function AudioUpload({ onReady, onBusy, remaining }: {
  onReady: (track: Track) => void
  onBusy?: (busy: boolean) => void
  remaining?: number
}) {
  const input = useRef<HTMLInputElement>(null)
  const running = useRef(false)
  const [items, setItems] = useState<UploadItem[]>([])
  const [category, setCategory] = useState('other')
  const [busy, setBusy] = useState(false)
  const queued = items.filter((item) => item.state === 'queued')
  const invalidTitle = (item: UploadItem) => !item.title.trim() || /[\\/:*?"<>|\p{Cc}\p{Cf}]/u.test(item.title)
  function update(key: string, patch: Partial<UploadItem>) {
    setItems((previous) => previous.map((item) => item.key === key ? { ...item, ...patch } : item))
  }

  async function transfer(batch: UploadItem[]) {
    if (running.current) return
    running.current = true
    setBusy(true)
    onBusy?.(true)
    try {
      for (const item of batch) {
        const checking = item.state === 'unconfirmed'
        const file = item.prepared ?? (category === 'other' ? item.file :
          new File([item.file], 'CDR-' + category + '-' + item.title.trim() + '.mp3', { type: item.file.type }))
        update(item.key, { state: checking ? 'processing' : 'uploading', prepared: file, issue: undefined, progress: undefined })
        try {
          let track = checking ? await stationApi.uploadStatus(file, item.key) :
            await stationApi.upload(file, item.key, (progress) =>
              update(item.key, { progress, state: progress === 1 ? 'processing' : 'uploading' }))
          if (!checking && !track) {
            update(item.key, { state: 'processing' })
            for (let attempt = 0; attempt < 2 && !track; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, 1500))
              track = await stationApi.uploadStatus(file, item.key)
            }
          }
          if (!track?.id || !(track.seconds && track.seconds > 0)) throw Error('upload_unconfirmed')
          update(item.key, { state: 'ready' })
          onReady(track)
        } catch (error) {
          const uncertain = checking || (error instanceof Error && error.message === 'upload_unconfirmed')
          update(item.key, { state: uncertain ? 'unconfirmed' : 'failed', issue: message(error) })
        }
      }
    } finally {
      running.current = false
      setBusy(false)
      onBusy?.(false)
    }
  }

  return <div className="upload-queue">
    <p className="muted">صيغة MP3، حتى ٥ ميبيبايت لكل ملف. يظهر المقطع بعد اكتمال معالجته.</p>
    <p className="muted">استخدم تسجيلات تملك حق استخدامها أو إذنًا مناسبًا لبثها في الفروع.</p>
    <div className="media-tools">
      <div className="file-picker">
        <button type="button" disabled={busy || mode === 'local'} onClick={() => input.current?.click()}>
          <Upload size={17} /> اختيار ملفات MP3
        </button>
        <input ref={input} className="screen-reader-file" type="file" multiple disabled={busy || mode === 'local'}
          tabIndex={-1} accept=".mp3,audio/mpeg" aria-label="ملفات MP3 حتى ٥ ميبيبايت" onChange={(e) => {
            const next = Array.from(e.target.files ?? [], (file): UploadItem => {
              const error = validateUpload(file)
              return { file, title: file.name.replace(/\.mp3$/i, '').slice(0, 140),
                key: crypto.randomUUID(), state: error ? 'failed' : 'queued',
                ...(error && { issue: message(Error(error)) }) }
            })
            setItems((previous) => [...previous, ...next])
            e.target.value = ''
          }} />
      </div>
      <label>تصنيف الملفات الجديدة<select disabled={busy} value={category} onChange={(e) => setCategory(e.target.value)}>
        {Object.entries(categories).filter(([key]) => key !== 'diagnostic').map(([key, item]) =>
          <option key={key} value={key}>{item.label}</option>)}
      </select></label>
    </div>
    {items.length > 0 && <ul className="upload-items">
      {items.map((item) => <li key={item.key}>
        <strong dir="auto">{item.file.name}</strong>
        {item.state === 'queued' && category !== 'other' && <label>عنوان المقطع
          <input value={item.title} maxLength={140} disabled={busy} aria-invalid={invalidTitle(item)}
            onChange={(e) => update(item.key, { title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} />
          {invalidTitle(item) && <span className="validation">أدخل عنوانًا صالحًا للمقطع.</span>}
        </label>}
        <div className="upload-status" aria-live="polite">
          {item.state === 'queued' && <span>جاهز للرفع</span>}
          {item.state === 'uploading' && <><span>جارٍ الرفع{item.progress !== undefined && ' · ' + count.format(Math.floor(item.progress * 100)) + '٪'}</span>
            <progress value={item.progress} max={1} aria-label="تقدّم رفع الملف" /></>}
          {item.state === 'processing' && <span>جارٍ التحقق من معالجة الملف…</span>}
          {item.state === 'ready' && <span className="pill" data-status="scheduled">أضيف إلى المكتبة</span>}
          {item.issue && <span className={item.state === 'failed' ? 'validation' : 'muted'}>{item.issue}</span>}
        </div>
        {item.state === 'unconfirmed' && <button type="button" disabled={busy} onClick={() => void transfer([item])}>تحقّق مجددًا</button>}
        {item.state === 'failed' && item.prepared && item.issue !== message(Error('invalid_mp3')) &&
          <button type="button" disabled={busy} onClick={() => void transfer([item])}>إعادة الرفع</button>}
        {(item.state === 'queued' || item.state === 'failed') &&
          <button type="button" disabled={busy} aria-label={'إزالة الملف ' + item.file.name}
            onClick={() => setItems((previous) => previous.filter((entry) => entry !== item))}>إزالة الملف</button>}
      </li>)}
    </ul>}
    {remaining !== undefined && queued.length > remaining &&
      <p className="muted">تتسع القائمة لـ {count.format(remaining)} من الملفات المختارة. تبقى بقية الملفات في المكتبة.</p>}
    <button type="button" className="primary" disabled={busy || !queued.length || (category !== 'other' && queued.some(invalidTitle))}
      onClick={() => void transfer(queued)}>
      رفع الملفات المختارة
    </button>
  </div>
}
