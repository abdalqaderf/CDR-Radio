import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { LogOut, LockKeyhole, Upload } from 'lucide-react'
import { TaskNotice, useEditorGuard, useTask } from './AdminFeedback'
import { AudioUpload } from './AudioUpload'
import { Collections } from './Collections'
import { categories, count, localHint, Modal, PreviewAudio, trackDuration, trackMatches, usePreview } from './PlaylistControls'
import { Daily } from './Daily'
import type { EditorProps } from './EditorContent'
import { Programs } from './Programs'
import { getWorkspace, login, logout, mode, onAdminAccessLost, stationApi, type Playlist, type Track, type Workspace } from './radio'

export function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const task = useTask()
  const fixture = mode === 'fixture'
  function submit(e: FormEvent) {
    e.preventDefault()
    void task.run(async () => {
      await login(email, password)
      window.location.assign('/admin')
    })
  }
  return (
    <section className="state-panel">
      <h2>
        {mode === 'disconnected'
          ? 'خدمة تسجيل الدخول غير متصلة'
          : fixture
            ? 'دخول المعاينة المحلية'
            : 'تسجيل الدخول'}
      </h2>
      <form onSubmit={submit}>
        <fieldset disabled={mode === 'disconnected' || task.busy}>
          {fixture ? (
            <p>يفتح هذا الزر مساحة التجربة المحلية ببيانات اختبار.</p>
          ) : (
            <>
              <label>
                البريد الإلكتروني
                <input
                  type="email"
                  autoComplete="username"
                  dir="ltr"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label>
                كلمة المرور
                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
            </>
          )}
          <button className="primary">
            <LockKeyhole size={16} />
            {fixture ? 'فتح المعاينة المحلية' : 'دخول'}
          </button>
        </fieldset>
      </form>
      <TaskNotice task={task} />
    </section>
  )
}
function Media({ library, libraryState, refreshLibrary, onUpload, onDirty }: EditorProps) {
  const libraryLoading = libraryState === 'loading'
  const libraryFailed = libraryState === 'failed'
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('title')
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const preview = usePreview()
  const task = useTask()
  const visible = library.filter((track) => trackMatches(track, filter, search)).sort((a, b) =>
    (sort === 'duration' ? (a.seconds ?? Infinity) - (b.seconds ?? Infinity) : 0) ||
      a.title.localeCompare(b.title, 'ar'))
  useEditorGuard(uploading, onDirty)
  return <section className="state-panel">
      <div className="panel-heading">
        <h2>كل الصوتيات</h2>
        <button type="button" className="primary" disabled={mode === 'local'} onClick={() => { preview.stop(); setShowUpload(true) }}>
          <Upload size={17} /> رفع ملفات جديدة
        </button>
      </div>
      <p className="muted">{localHint}</p>
      <div className="media-tools">
        <label>بحث في المكتبة<input type="search" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
        <label>التصنيف<select aria-label="التصنيف" value={filter} onChange={(e) => { setFilter(e.target.value); preview.stop() }}>
          <option value="all">كل التصنيفات</option>
          {Object.entries(categories).map(([key, info]) => <option key={key} value={key}>{info.label}</option>)}
        </select></label>
      </div>
      <div className="library-toolbar">
        {!libraryLoading && <p className="meta-line">{count.format(visible.length)} مقطع</p>}
        <details className="disclosure">
          <summary>خيارات العرض</summary>
        <label>ترتيب النتائج<select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="title">حسب العنوان</option><option value="duration">حسب المدة</option>
        </select></label>
          <p className="muted">إزالة مقطع من قائمة تُبقي ملفه في المكتبة. حذف الملف من المحطة يؤثر في كل القوائم التي تستخدمه.</p>
        </details>
      </div>
      {libraryLoading && !task.busy && <p className="muted" role="status">جارٍ تحميل المكتبة…</p>}
      {libraryFailed && <div className="row-actions"><p className="validation" role="alert">تعذّر تحديث المكتبة.</p>
        <button type="button" disabled={task.busy || libraryLoading}
          onClick={() => void task.run(refreshLibrary)}>إعادة تحميل المكتبة</button></div>}
      <TaskNotice task={task} waiting="جارٍ تحميل المكتبة…" />
      <ul className="library">
        {visible.map((track) => {
          const info = categories[track.category ?? 'other']
          const Icon = info.icon
          const listening = preview.state?.id === track.id
          return <li key={track.id}>
            <div className="media-row">
              <span className="tile-icon"><Icon size={21} /></span>
              <div className="media-title"><strong dir="auto">{track.title}</strong>
                <p className="meta-line">{info.label} · <bdi>{trackDuration(track.seconds) ?? 'المدة غير معروفة'}</bdi></p>
                {track.broadcastRestricted && <p className="meta-line">الاستماع التجريبي فقط بموجب إذن التسجيل.</p>}
              </div>
              <button type="button" aria-expanded={listening} disabled={track.previewable === false}
                aria-label={(listening ? 'إيقاف الاستماع التجريبي إلى ' : 'استماع تجريبي إلى ') + track.title}
                onClick={() => void preview.toggle(track)}>{listening ? 'إيقاف الاستماع' : 'استماع تجريبي'}</button>
            </div>
            {listening && <PreviewAudio preview={preview.state} />}
          </li>
        })}
      </ul>
      {!visible.length && !libraryLoading && !libraryFailed &&
        <p className="empty">{mode === 'local' ? 'المكتبة غير متصلة بالمحطة.' : search || filter !== 'all' ?
          'لا توجد مقاطع مطابقة. جرّب تغيير البحث أو التصنيف.' : 'ارفع ملفًا صوتيًا لإضافته إلى المكتبة.'}</p>}
      <Modal open={showUpload} title="رفع ملفات جديدة" sheet busy={uploading} close={() => setShowUpload(false)}>
        <div className="modal-body"><AudioUpload onReady={(track) => {
          onUpload(track); setSearch(''); setFilter(track.category ?? 'other')
        }} onBusy={setUploading} /></div>
      </Modal>
    </section>
}

function AudioLibrary(props: EditorProps & { onSaved: (collection: Playlist) => void }) {
  const [tab, setTab] = useState<'all' | 'collections'>('all')
  const dirty = useRef(false)
  const { onDirty } = props
  const markDirty = useCallback((value: boolean) => { dirty.current = value; onDirty(value) }, [onDirty])
  function open(next: typeof tab) {
    if (tab !== next && (!dirty.current || confirm('هل تريد مغادرة العرض الحالي؟ قد توجد تغييرات غير محفوظة أو عملية جارية.'))) setTab(next)
  }
  return <>
    <div className="filters" role="group" aria-label="عرض الصوتيات">
      <button type="button" aria-pressed={tab === 'all'} onClick={() => open('all')}>كل الصوتيات</button>
      <button type="button" aria-pressed={tab === 'collections'} onClick={() => open('collections')}>المجموعات</button>
    </div>
    {tab === 'all' ? <Media {...props} onDirty={markDirty} /> : <Collections {...props} onDirty={markDirty} />}
  </>
}

export function Admin({ path, title }: { path: string; title: string }) {
  const [data, setData] = useState<Workspace | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [libraryFailed, setLibraryFailed] = useState(false)
  const [libraryLoading, setLibraryLoading] = useState(mode === 'fixture' || mode === 'hosted')
  const [locked, setLocked] = useState(mode === 'disconnected')
  const [loadFailed, setLoadFailed] = useState(false)
  const dirty = useRef(false)
  const task = useTask()
  const onDirty = useCallback((value: boolean) => { dirty.current = value }, [])
  async function refresh() {
    const workspace = await getWorkspace()
    setData(workspace)
    return workspace
  }
  const libraryGeneration = useRef(0)
  async function refreshLibrary() {
    if (mode !== 'fixture' && mode !== 'hosted') return
    const generation = ++libraryGeneration.current
    setLibraryLoading(true)
    setLibraryFailed(false)
    try {
      const library = await stationApi.list()
      if (generation === libraryGeneration.current) { setTracks(library); setLibraryFailed(false) }
    } catch (error) {
      if (generation === libraryGeneration.current) setLibraryFailed(true)
      throw error
    } finally {
      if (generation === libraryGeneration.current) setLibraryLoading(false)
    }
  }
  function onUpload(track: Track) {
    libraryGeneration.current++
    setLibraryLoading(false)
    setTracks((previous) => [...previous.filter((item) => item.id !== track.id), track])
  }
  function onCollectionSaved(collection: Playlist) {
    setData((previous) => previous && {
      ...previous,
      collections: [...previous.collections.filter((item) => item.id !== collection.id), collection]
        .sort((a, b) => a.title.localeCompare(b.title, 'ar')),
    })
  }
  function loadWorkspace() {
    setLoadFailed(false)
    void refresh().then(() => refreshLibrary().catch(() => {})).catch(() => setLoadFailed(true))
  }
  useEffect(() => {
    const unsubscribe = onAdminAccessLost(() => {
      libraryGeneration.current++
      setLocked(true)
      setData(null)
      setTracks([])
    })
    if (mode !== 'disconnected') loadWorkspace()
    return unsubscribe
  }, [])
  if (locked) return <section className="state-panel">
    <h1 className="state-title">يتطلب هذا القسم تسجيل الدخول</h1>
    <p>يقتصر الوصول إلى المحتوى على المسؤول المخوّل.</p>
    <a className="action" href="/admin/login">تسجيل الدخول</a>
  </section>
  if (!data) return <section className="state-panel">
    {loadFailed ? <>
      <h2 role="alert">تعذّر تحميل مساحة الإدارة</h2>
      <p>تحقّق من الاتصال ثم أعد المحاولة.</p>
      <button type="button" onClick={loadWorkspace}>إعادة المحاولة</button>
    </> : <h2 role="status">جارٍ تحميل مساحة الإدارة…</h2>}
  </section>
  const Editor = path === '/admin/programs' ? Programs : Daily
  const editorProps: EditorProps = {
    library: tracks, collections: data.collections ?? [],
    libraryState: libraryLoading ? 'loading' : libraryFailed ? 'failed' : 'ready',
    refreshLibrary, refresh, onUpload, onDirty,
  }
  return <>
    <div className="admin-heading">
      <h1>{title}</h1>
      <button type="button" disabled={task.busy} onClick={() => {
        if (dirty.current && !confirm('هناك تغييرات غير محفوظة أو عملية جارية. هل تريد تسجيل الخروج؟')) return
        void task.run(async () => { await logout(); location.assign('/admin/login') })
      }}><LogOut size={16} /> خروج</button>
    </div>
    <TaskNotice task={task} />
    {path === '/admin/media' ? (
      <AudioLibrary {...editorProps} onSaved={onCollectionSaved} />
    ) : (
      <Editor workspace={data} {...editorProps} />
    )}
  </>
}
