import { useEffect, useRef, useState, type FormEvent } from 'react'
import { AudioLines, CalendarDays, Headphones, Library, LogOut, LockKeyhole } from 'lucide-react'
import {
  ammanDate,
  discardProgram,
  getWorkspace,
  login,
  logout,
  message,
  mode,
  onAdminAccessLost,
  previewWindow,
  saveDraft,
  stationApi,
  syncProgram,
  type Playlist,
  type Preview,
  type Program,
  type TimeWindow,
  type Track,
  type Workspace,
} from './radio'
import { TrackOrder } from './TrackOrder'
import { Player } from './Player'

function useTask() {
  const working = useRef(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [failed, setFailed] = useState(false)
  async function run(fn: () => Promise<string | void>) {
    if (working.current) return
    working.current = true
    setBusy(true)
    setNotice('')
    setFailed(false)
    try {
      setNotice((await fn()) || '')
    } catch (e) {
      setFailed(true)
      setNotice(message(e))
    } finally {
      working.current = false
      setBusy(false)
    }
  }
  return { run, busy, notice, failed }
}

function TaskNotice({ task }: { task: ReturnType<typeof useTask> }) {
  return <p className="task-notice" data-failed={task.failed} role={task.failed ? 'alert' : 'status'}>
    {task.busy ? 'جارٍ تنفيذ العملية…' : task.notice}
  </p>
}

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

function Media({
  workspace,
  library,
  libraryFailed,
  refresh,
}: {
  workspace: Workspace
  library: Track[]
  libraryFailed: boolean
  refresh: () => Promise<void>
}) {
  const [search, setSearch] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const upload = useTask()
  const fileInput = useRef<HTMLInputElement>(null)
  const visible = library.filter((t) => t.title.includes(search.trim()))
  const [edit, setEdit] = useState<Playlist | null>(null)
  const [generation, setGeneration] = useState(0)
  return (
    <>
      <section className="state-panel">
        <h2>ملفات الصوت</h2>
        <label>
          بحث في المكتبة
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <ul className="library">
          {visible.map((t) => (
            <li key={t.id}>{t.title}</li>
          ))}
        </ul>
        {!visible.length && (
          <p>{libraryFailed || mode === 'local' ? 'المكتبة غير متصلة بالمحطة.' : 'لا توجد مقاطع مطابقة.'}</p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (file)
              void upload.run(async () => {
                await stationApi.upload(file)
                await refresh()
                setFile(null)
                if (fileInput.current) fileInput.current.value = ''
                return mode === 'hosted' ? 'أضيف الملف إلى مكتبة المحطة.' : 'أضيف الملف إلى مكتبة المعاينة المحلية.'
              })
          }}
        >
          <fieldset disabled={mode === 'local' || libraryFailed || upload.busy}>
            <legend>إضافة ملف صوتي</legend>
            <label>
              ملف MP3 حتى ٥ ميبيبايت
              <input
                ref={fileInput}
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button disabled={!file}>
              {upload.busy ? 'جارٍ حفظ الملف…' : mode === 'hosted' ? 'إضافة إلى مكتبة المحطة' : 'إضافة إلى مكتبة المعاينة'}
            </button>
          </fieldset>
        </form>
        <p role="status">{upload.notice}</p>
      </section>
      <section className="state-panel">
        <h2>مسودات قوائم التشغيل</h2>
        {workspace.playlists.length === 0 && <p>لا توجد قوائم محفوظة.</p>}
        {workspace.playlists.map((p) => (
          <div className="saved" key={p.id}>
            <span>
              {p.title}
              {workspace.dailyId === p.id && ' · القائمة اليومية المقترحة'}
            </span>
            <button
              onClick={() => {
                setEdit(p)
                setGeneration((n) => n + 1)
              }}
            >
              تحرير القائمة
            </button>
          </div>
        ))}
        <button
          onClick={() => {
            setEdit(null)
            setGeneration((n) => n + 1)
          }}
        >
          قائمة جديدة
        </button>
        <PlaylistForm
          key={generation}
          existing={edit}
          dailyId={workspace.dailyId}
          library={library}
          refresh={refresh}
        />
      </section>
    </>
  )
}

function PlaylistForm({
  existing,
  dailyId,
  library,
  refresh,
}: {
  existing: Playlist | null
  dailyId: string | null
  library: Track[]
  refresh: () => Promise<void>
}) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID())
  const [revision, setRevision] = useState(existing?.revision ?? 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [ids, setIds] = useState(existing?.tracks ?? [])
  const [daily, setDaily] = useState(existing != null && existing.id === dailyId)
  const task = useTask()
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void task.run(async () => {
          setRevision(await saveDraft('playlist', id, revision, { title, tracks: ids, daily }))
          await refresh()
          return 'حُفظت مسودة القائمة.'
        })
      }}
    >
      <fieldset disabled={task.busy}>
        <label>
          اسم القائمة
          <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <TrackOrder library={library} ids={ids} onChange={setIds} />
        <label className="check">
          <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
          اقتراحها قائمةً يومية
        </label>
        <button className="primary" disabled={!ids.length}>
          حفظ مسودة القائمة
        </button>
        {mode === 'hosted' ? (
          <p className="muted">استخدم ترتيب المسودة في <a href="/admin/programs">البرامج المجدولة</a> للنشر. تعمل القائمة اليومية 176 من المحطة.</p>
        ) : (
          <button type="button" disabled>نشر القائمة على المحطة</button>
        )}
      </fieldset>
      <p role="status">{task.notice}</p>
    </form>
  )
}

function Programs({
  workspace,
  library,
  refresh,
}: {
  workspace: Workspace
  library: Track[]
  refresh: () => Promise<void>
}) {
  const [selected, setSelected] = useState<Program | null>(null)
  const [generation, setGeneration] = useState(0)
  const task = useTask()
  function open(program: Program | null) {
    setSelected(program)
    setGeneration((n) => n + 1)
  }
  function reconcile(program: Program, action: 'retry' | 'cancel') {
    void task.run(async () => {
      const result = await syncProgram(action, program.id, program.revision)
      await refresh()
      open(null)
      if (result.error) throw Error(result.error)
      return result.status === 'cancelled' ? 'تأكّد إلغاء البرنامج من المحطة.' : 'تأكّد حفظ البرنامج على المحطة.'
    })
  }
  return (
    <>
      <section className="state-panel">
        <h2>البرامج المحفوظة</h2>
        {!workspace.programs.length && <p>لا توجد برامج محفوظة.</p>}
        {workspace.programs.map((p) => (
          <div className="saved" key={p.id}>
            <div>
              <strong>{p.title}</strong>
              <p>
                {statusLabels[p.status]} · {ammanDate(p.startsAt)}
              </p>
              {p.providerPlaylistId && <p>قائمة المحطة {p.providerPlaylistId}</p>}
              {p.verifiedAt && <p>آخر تحقق من المحطة {ammanDate(p.verifiedAt)}</p>}
            </div>
            <div className="row-actions">
              {p.status === 'draft' && (
                <button disabled={task.busy} onClick={() => open(p)}>تحرير المسودة</button>
              )}
              {mode === 'hosted' && p.status === 'scheduled' && Date.parse(p.startsAt) > Date.now() + 60000 && (
                <button disabled={task.busy} onClick={() => open(p)}>تحرير البرنامج المنشور</button>
              )}
              {mode === 'hosted' && p.pendingAction && (
                <button disabled={task.busy} onClick={() => reconcile(p, 'retry')}>إعادة التحقق من المحطة</button>
              )}
              {mode === 'hosted' && (p.status === 'scheduled' || p.pendingAction) && (
                <button disabled={task.busy} onClick={() => {
                  if (confirm('إلغاء هذا البرنامج وإزالة جدولته من المحطة؟')) reconcile(p, 'cancel')
                }}>إلغاء البرنامج في المحطة</button>
              )}
            </div>
          </div>
        ))}
        <button disabled={task.busy} onClick={() => open(null)}>مسودة جديدة</button>
        <p role="status">{task.notice}</p>
      </section>
      <ProgramForm
        key={generation}
        existing={selected}
        playlists={workspace.playlists}
        library={library}
        refresh={refresh}
        cleared={() => open(null)}
        stationBusy={task.busy}
      />
    </>
  )
}

const statusLabels: Record<string, string> = {
  draft: 'مسودة',
  publishing: 'جارٍ النشر',
  scheduled: 'مجدول',
  sync_failed: 'بانتظار التحقق',
  cancelled: 'ملغى',
}

function ProgramForm({
  existing,
  playlists,
  library,
  refresh,
  cleared,
  stationBusy,
}: {
  existing: Program | null
  playlists: Playlist[]
  library: Track[]
  refresh: () => Promise<void>
  cleared: () => void
  stationBusy: boolean
}) {
  const [id] = useState(() => existing?.id ?? crypto.randomUUID())
  const [revision, setRevision] = useState(existing?.revision ?? 0)
  const [title, setTitle] = useState(existing?.title ?? '')
  const [windowSpec, setWindow] = useState<TimeWindow>(
    existing?.window ?? { date: '', start: '', end: '', wholeDay: false },
  )
  const [ids, setIds] = useState(existing?.tracks ?? [])
  const [playback, setPlayback] = useState(existing?.playback ?? 'repeat')
  const [endPolicy, setEndPolicy] = useState(existing?.endPolicy ?? 'daily')
  const [transition, setTransition] = useState(existing?.transition ?? 'finish')
  const editing = existing?.status === 'scheduled'
  const doc = { title, tracks: ids, window: windowSpec, playback, endPolicy, transition }
  const [savedDoc, setSavedDoc] = useState(existing ? JSON.stringify(doc) : '')
  const [handedOff, setHandedOff] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const task = useTask()
  const update = (change: Partial<TimeWindow>) => {
    setPreview(null)
    setWindow({ ...windowSpec, ...change })
  }
  return (
    <section className="state-panel">
      <h2>{existing ? 'تحرير البرنامج' : 'إعداد البرنامج'}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void task.run(async () => {
            if (editing) {
              const result = await syncProgram('edit', id, revision, doc)
              setRevision(result.revision)
              setHandedOff(Boolean(result.error))
              await refresh()
              if (result.error) throw Error(result.error)
              return 'تأكّد حفظ التعديل على المحطة.'
            }
            setRevision(
              await saveDraft('program', id, revision, doc),
            )
            setSavedDoc(JSON.stringify(doc))
            await refresh()
            return 'حُفظت مسودة البرنامج.'
          })
        }}
      >
        <fieldset disabled={task.busy || stationBusy || handedOff}>
          <label>
            اسم المناسبة
            <input required maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label>
            التاريخ بتوقيت عمّان
            <input
              type="date"
              required
              value={windowSpec.date}
              onChange={(e) => update({ date: e.target.value })}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={windowSpec.wholeDay}
              onChange={(e) => update({ wholeDay: e.target.checked })}
            />
            طوال اليوم
          </label>
          {!windowSpec.wholeDay && (
            <div className="time-grid">
              <label>
                وقت البداية
                <input
                  type="time"
                  required
                  value={windowSpec.start}
                  onChange={(e) => update({ start: e.target.value })}
                />
              </label>
              <label>
                وقت النهاية
                <input
                  type="time"
                  required
                  value={windowSpec.end}
                  onChange={(e) => update({ end: e.target.value })}
                />
              </label>
            </div>
          )}
          {playlists.length > 0 && (
            <label>
              نسخ ترتيب المقاطع من قائمة محفوظة
              <select value="" onChange={(e) => {
                const list = playlists.find((playlist) => playlist.id === e.target.value)
                if (list && (!ids.length || confirm('استبدال المقاطع الحالية بمقاطع القائمة؟')))
                  setIds([...list.tracks])
              }}>
                <option value="">اختر قائمة</option>
                {playlists.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            </label>
          )}
          <TrackOrder library={library} ids={ids} onChange={setIds} />
          <label>
            التشغيل داخل الفترة
            <select value={playback} onChange={(e) => setPlayback(e.target.value)}>
              <option value="repeat">تكرار القائمة بالترتيب</option>
              <option value="once">مرة واحدة</option>
            </select>
          </label>
          <label>
            عند نهاية الفترة
            <select value={endPolicy} onChange={(e) => setEndPolicy(e.target.value)}>
              <option value="daily">العودة إلى القائمة اليومية</option>
              <option value="stop">إيقاف البث</option>
            </select>
          </label>
          {endPolicy === 'stop' && (
            <p>خيار الإيقاف مخصّص لنهاية ساعات العمل. اختر العودة إلى القائمة اليومية أثناء ساعات عمل الفروع.</p>
          )}
          <label>
            الانتقال بين المقاطع
            <select value={transition} onChange={(e) => setTransition(e.target.value)}>
              <option value="finish">إكمال المقطع الحالي</option>
              <option value="interrupt">مقاطعة فورية</option>
            </select>
          </label>
          <p className="muted">
            {transition === 'finish'
              ? 'تطلب المسودة انتظار نهاية المقطع الجاري عند الانتقال. قد يأتي الانتقال بعد الوقت المحدد.'
              : 'قد ينقطع المقطع قبل نهايته.'}
          </p>
          <div className="row-actions">
            <button
              type="button"
              onClick={() =>
                void task.run(async () => {
                  setPreview(await previewWindow(windowSpec, id))
                })
              }
            >
              معاينة الفترة
            </button>
            <button className="primary" disabled={!ids.length}>
              {editing ? 'حفظ التعديل على المحطة' : 'حفظ مسودة البرنامج'}
            </button>
            {!editing && (
              <button type="button"
                disabled={mode !== 'hosted' || !revision || savedDoc !== JSON.stringify(doc)}
                onClick={() => void task.run(async () => {
                  const result = await syncProgram('publish', id, revision)
                  setHandedOff(true)
                  await refresh()
                  if (result.error) throw Error(result.error)
                  return 'تأكّد نشر البرنامج على المحطة.'
                })}
              >نشر البرنامج</button>
            )}
          </div>
          {mode === 'hosted'
            ? <p className="muted">يدعم النشر التجريبي فترات أقل من ٢٤ ساعة ومقطعين مختلفين على الأقل. قد تبدأ المحطة مبكرًا أو تشغّل مقطعًا إضافيًا بعد النهاية.</p>
            : <p className="muted">النشر على المحطة متاح من لوحة الإدارة المستضافة.</p>}
          {revision > 0 && !editing && savedDoc && (
            <button
              type="button"
              onClick={() => {
                if (confirm('حذف هذه المسودة؟'))
                  void task.run(async () => {
                    await discardProgram(id, revision)
                    await refresh()
                    cleared()
                  })
              }}
            >
              حذف المسودة
            </button>
          )}
        </fieldset>
      </form>
      {preview && (
        <div className="summary" aria-live="polite">
          <strong>الفترة بتوقيت عمّان</strong>
          <p>
            {ammanDate(preview.startsAt)} — {ammanDate(preview.endsAt)}
          </p>
          <p>
            {preview.conflicts.length
              ? 'تتداخل الفترة مع: ' + preview.conflicts.map((c) => c.title + ' (' + statusLabels[c.status] + ')').join('، ')
              : 'لا توجد فترات متداخلة محفوظة.'}
          </p>
          {ids.length > 0 && (
            <ol aria-label="ترتيب التشغيل في المعاينة">
              {ids.map((track, position) => (
                <li key={position}>{library.find((item) => item.id === track)?.title ?? track}</li>
              ))}
            </ol>
          )}
        </div>
      )}
      <p role="status">{task.notice}</p>
    </section>
  )
}

export function Admin({ path }: { path: string }) {
  const [data, setData] = useState<Workspace | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [libraryFailed, setLibraryFailed] = useState(false)
  const [locked, setLocked] = useState(mode === 'disconnected')
  const [loadFailed, setLoadFailed] = useState(false)
  const task = useTask()
  async function refresh() {
    const workspace = await getWorkspace()
    let media: Track[] = []
    if (mode === 'fixture' || mode === 'hosted') {
      try {
        media = await stationApi.list()
        setLibraryFailed(false)
      } catch (e) {
        if (e instanceof Error && e.message === 'admin_required') throw e
        setLibraryFailed(true)
      }
    }
    setData(workspace)
    setTracks(media)
  }
  function loadWorkspace() {
    setLoadFailed(false)
    void refresh().catch(() => setLoadFailed(true))
  }
  useEffect(() => {
    const unsubscribe = onAdminAccessLost(() => {
      setLocked(true)
      setData(null)
      setTracks([])
    })
    if (mode !== 'disconnected') loadWorkspace()
    return unsubscribe
  }, [])
  if (locked)
    return (
      <section className="state-panel">
        <h2>يتطلب هذا القسم تسجيل الدخول</h2>
        <p>يقتصر الوصول إلى المحتوى على المسؤول المخوّل.</p>
        <a className="action" href="/admin/login">تسجيل الدخول</a>
      </section>
    )
  if (!data)
    return (
      <section className="state-panel">
        {loadFailed ? (
          <>
            <h2 role="alert">تعذّر تحميل مساحة الإدارة</h2>
            <p>تحقّق من الاتصال ثم أعد المحاولة.</p>
            <button onClick={loadWorkspace}>إعادة المحاولة</button>
          </>
        ) : <h2 role="status">جارٍ تحميل مساحة الإدارة…</h2>}
      </section>
    )
  return (
    <>
      <div className="session">
        <span>{mode === 'fixture' ? 'مساحة تجريبية على هذا الجهاز' : mode === 'hosted' ? 'إدارة المحطة' : 'مساحة الإدارة المحلية'}</span>
        <button
          disabled={task.busy}
          onClick={() =>
            void task.run(async () => {
              await logout()
              location.assign('/admin/login')
            })
          }
        >
          <LogOut size={16} />
          خروج
        </button>
      </div>
      <TaskNotice task={task} />
      {path === '/admin/media' ? (
        <Media workspace={data} library={tracks} libraryFailed={libraryFailed} refresh={refresh} />
      ) : path === '/admin/programs' ? (
        <Programs workspace={data} library={tracks} refresh={refresh} />
      ) : (
        <>
          <section className="dashboard" aria-labelledby="dashboard-title">
            <h2 id="dashboard-title">إدارة المحتوى</h2>
            <div className="dashboard-links">
              <a href="/admin/media">
                <span className="tile-icon"><Library size={22} aria-hidden="true" /></span>
                <strong>مكتبة الصوت</strong><span>{libraryFailed ? 'تعذّر تحميل المقاطع' : tracks.length + ' مقطعًا في المكتبة'}</span>
              </a>
              <a href="/admin/media#playlists">
                <span className="tile-icon"><AudioLines size={22} aria-hidden="true" /></span>
                <strong>قوائم التشغيل</strong><span>{data.playlists.length} مسودة قائمة</span>
              </a>
              <a href="/admin/programs">
                <span className="tile-icon"><CalendarDays size={22} aria-hidden="true" /></span>
                <strong>البرامج المجدولة</strong><span>{data.programs.filter((p) => p.status === 'scheduled' && Date.parse(p.endsAt) > Date.now()).length} برنامجًا مجدولًا</span>
              </a>
            </div>
          </section>
          <div className="state-panel overview-strip">
            <div><h2>القائمة اليومية المقترحة</h2><p>{data.playlists.find((p) => p.id === data.dailyId)?.title ?? 'لم تُحدّد'}</p></div>
            <a className="outline-action" href="/listen"><Headphones size={18} aria-hidden="true" /> فتح مشغّل الفرع</a>
          </div>
          <Player monitor />
        </>
      )}
    </>
  )
}
