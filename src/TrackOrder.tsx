import { useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, GripVertical, Headphones, ListPlus, Undo2, X } from 'lucide-react'
import { AudioUpload } from './AudioUpload'
import { categories, count, localHint, Modal, orderLimit, PreviewAudio, trackDuration, trackMatches, unknownTitle, usePreview } from './PlaylistControls'
import { mode, type Playlist, type Track } from './radio'

function TrackRow({ row, index, length, preview, move, remove, loading }: {
  row: { key: string; track?: Track }
  index: number
  length: number
  preview: ReturnType<typeof usePreview>
  move: (to: number) => void
  remove: () => void
  loading: boolean
}) {
  const sortable = useSortable({ id: row.key })
  const title = row.track?.title ?? (loading ? 'جارٍ تحميل بيانات المقطع…' : unknownTitle)
  const listening = Boolean(row.track && preview.state?.id === row.track.id)
  return <li ref={sortable.setNodeRef} data-dragging={sortable.isDragging}
    style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}>
    <span className="track-position" aria-label={'الموضع ' + count.format(index + 1)}>{count.format(index + 1)}</span>
    <div className="track-name"><strong dir="auto">{title}</strong>
      <span className="meta-line">{trackDuration(row.track?.seconds) ?? (loading && !row.track ? '' : 'المدة غير معروفة')}</span>
      {row.track?.broadcastRestricted && <span className="meta-line">الاستماع التجريبي فقط بموجب إذن التسجيل.</span>}
    </div>
    <div className="track-actions">
      <button type="button" className="icon-button" disabled={!row.track || row.track.previewable === false}
        aria-label={(listening ? 'إيقاف الاستماع التجريبي إلى ' : 'استماع تجريبي إلى ') + title}
        onClick={() => { if (row.track) void preview.toggle(row.track) }}>
        <Headphones size={18} />
      </button>
      <button type="button" className="icon-button track-handle" ref={sortable.setActivatorNodeRef}
        {...sortable.attributes} {...sortable.listeners} aria-roledescription="مقبض ترتيب"
        aria-label={'سحب ' + title + ' للترتيب'}><GripVertical size={20} /></button>
      <button type="button" className="icon-button" disabled={index === 0}
        aria-label={'تقديم ' + title} onClick={() => move(index - 1)}><ArrowUp size={18} /></button>
      <button type="button" className="icon-button" disabled={index === length - 1}
        aria-label={'تأخير ' + title} onClick={() => move(index + 1)}><ArrowDown size={18} /></button>
      <button type="button" className="icon-button track-remove" aria-label={'إزالة ' + title + ' من القائمة'}
        onClick={remove}><X size={18} /></button>
    </div>
  </li>
}

export function TrackOrder({ library, collections, libraryState, ids, onChange, onUpload, refreshLibrary, resetKey, onUploadBusy }: {
  library: Track[]
  collections: Playlist[]
  libraryState: 'loading' | 'failed' | 'ready'
  ids: string[]
  onChange: Dispatch<SetStateAction<string[]>>
  onUpload: (track: Track) => void
  refreshLibrary: () => Promise<void>
  resetKey: string
  onUploadBusy: (busy: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [tab, setTab] = useState('library')
  const [collectionId, setCollectionId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [chosen, setChosen] = useState<string[]>([])
  const [localId, setLocalId] = useState('')
  const [notice, setNotice] = useState('')
  const [removed, setRemoved] = useState<{ id: string; index: number; resetKey: string } | null>(null)
  const list = useRef<HTMLOListElement>(null)
  const add = useRef<HTMLButtonElement>(null)
  const preview = usePreview()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))
  const catalog = new Map(library.map((track) => [track.id, track]))
  const occurrences = new Map<string, number>()
  const rows = ids.map((id) => {
    const occurrence = (occurrences.get(id) ?? 0) + 1
    occurrences.set(id, occurrence)
    return { key: id + ':' + occurrence, track: catalog.get(id) }
  })
  const unknown = rows.filter((row) => !trackDuration(row.track?.seconds)).length
  const duration = trackDuration(rows.reduce((total, row) =>
    total + (trackDuration(row.track?.seconds) ? row.track!.seconds! : 0), 0))
  const available = orderLimit - ids.length
  const undo = removed?.resetKey === resetKey && available > 0 && !ids.includes(removed.id) ? removed : null
  const collection = collections.find((item) => item.id === collectionId)
  const candidates = collection?.tracks.filter((id) => !ids.includes(id)) ?? []
  const unavailable = candidates.filter((id) => !catalog.has(id)).length
  const results = tab === 'collections'
    ? (collection?.tracks ?? []).flatMap((id) => catalog.get(id) ?? [])
    : library.filter((track) => trackMatches(track, filter, query))
  const validChoices = (tab === 'collections' ? candidates.filter((id) => chosen.includes(id)) : chosen)
    .filter((id) => catalog.has(id) && !ids.includes(id))
  const rowName = (key: string | number) => rows.find((row) => row.key === key)?.track?.title ?? unknownTitle

  function append(additions: string[]) {
    onChange((previous) => [...previous, ...additions.filter((id) => !previous.includes(id))].slice(0, orderLimit))
  }
  function finishSelection(additions: string[]) {
    append(additions)
    setChosen([])
    setQuery('')
    preview.stop()
    setOpen(false)
    setNotice('أُضيفت المقاطع إلى القائمة.')
  }
  function chooseSource(source: string) {
    preview.stop()
    setChosen([])
    setTab(source)
  }
  function move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || to >= ids.length) return
    onChange(arrayMove(ids, from, to))
    setNotice('نُقل «' + (rows[from]?.track?.title ?? unknownTitle) + '» إلى الموضع ' + count.format(to + 1) + '.')
  }
  function remove(index: number) {
    const id = ids[index]
    if (!id) return
    if (preview.state?.id === id) preview.stop()
    setRemoved({ id, index, resetKey })
    onChange(ids.filter((_, position) => position !== index))
    setNotice('أُزيل المقطع من القائمة. يمكنك التراجع قبل الحفظ.')
    requestAnimationFrame(() => {
      const next = list.current?.children[Math.min(index, ids.length - 2)]?.querySelector<HTMLButtonElement>('.track-handle')
      const target = next ?? add.current
      target?.focus({ preventScroll: true })
    })
  }

  return <section className="ordered-editor" aria-label="ترتيب المقاطع">
    <div className="panel-heading">
      <div><h3>ترتيب المقاطع</h3>
        <p className="meta-line">{count.format(ids.length)} مقطع
          {duration && <> · {unknown ? 'المدة المعروفة ' : 'المدة الإجمالية '}<bdi>{duration}</bdi></>}
          {unknown > 0 && <> · {libraryState === 'loading' ? 'جارٍ تحميل المدد' : 'المدة غير معروفة لـ ' + count.format(unknown) + ' مقطع'}</>}
        </p>
      </div>
      <button ref={add} type="button" className="add-tracks" disabled={available <= 0} onClick={() => {
        preview.stop(); setOpen(true)
      }}><ListPlus size={19} /> إضافة صوتيات</button>
    </div>
    {mode === 'local' && <div className="row-actions">
      <label>معرّف المقطع في بيئة التطوير
        <input dir="ltr" value={localId} maxLength={160} onChange={(e) => setLocalId(e.target.value.trim())} />
      </label>
      <button type="button" disabled={available <= 0 || !/^[A-Za-z0-9_:.~-]{1,160}$/.test(localId)}
        onClick={() => { onChange([...ids, localId]); setLocalId('') }}>إضافة المقطع</button>
    </div>}
    {rows.length ? <>
      <p className="track-help muted">اسحب لترتيب المقاطع أو استخدم الأسهم. الاستماع التجريبي على جهازك فقط.</p>
      {!open && <PreviewAudio preview={preview.state} />}
      <DndContext sensors={sensors} collisionDetection={closestCenter}
        modifiers={[({ transform }) => ({ ...transform, x: 0 })]}
        accessibility={{
          screenReaderInstructions: { draggable: 'اضغط مسافة لالتقاط المقطع. استخدم السهم للأعلى أو للأسفل ثم اضغط مسافة لوضعه، أو Escape للإلغاء.' },
          announcements: {
            onDragStart: ({ active }) => 'تم التقاط ' + rowName(active.id),
            onDragOver: ({ over }) => over ? 'الموضع ' + count.format(rows.findIndex((row) => row.key === over.id) + 1) : '',
            onDragEnd: ({ active }) => 'تم وضع ' + rowName(active.id),
            onDragCancel: () => 'أُلغي تغيير الترتيب.',
          },
        }}
        onDragEnd={({ active, over }) => {
          if (over) move(rows.findIndex((row) => row.key === active.id), rows.findIndex((row) => row.key === over.id))
        }}>
        <SortableContext items={rows.map((row) => row.key)} strategy={verticalListSortingStrategy}>
          <ol className="order-list" ref={list}>
            {rows.map((row, index) => <TrackRow key={row.key} row={row} index={index} length={rows.length}
              preview={preview} move={(to) => move(index, to)} remove={() => remove(index)} loading={libraryState === 'loading'} />)}
          </ol>
        </SortableContext>
      </DndContext>
    </> : <p className="empty">أضف مقاطع من المكتبة أو ارفع ملفات جديدة.</p>}
    <p role="status" className="track-notice">{notice}</p>
    {undo && <button type="button" onClick={() => {
      const restored = [...ids]
      restored.splice(undo.index, 0, undo.id)
      onChange(restored)
      setRemoved(null)
      setNotice('أُعيد المقطع إلى القائمة.')
      add.current?.focus()
    }}><Undo2 size={17} /> تراجع عن الإزالة</button>}
    <Modal open={open} close={() => { preview.stop(); setOpen(false) }} title="إضافة صوتيات" sheet busy={uploading}>
      <div className="filters picker-tabs" role="group" aria-label="مصدر المقاطع">
        <button type="button" disabled={uploading} aria-pressed={tab === 'library'} onClick={() => chooseSource('library')}>كل الصوتيات</button>
        <button type="button" disabled={uploading} aria-pressed={tab === 'collections'} onClick={() => chooseSource('collections')}>المجموعات</button>
        <button type="button" aria-pressed={tab === 'upload'} disabled={mode === 'local' || uploading}
          onClick={() => chooseSource('upload')}>رفع ملفات جديدة</button>
      </div>
      <div className="modal-body">
        {tab !== 'upload' && <div>
          {tab === 'library' ? <div className="media-tools">
            <label>بحث في المكتبة<input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }} /></label>
            <label>تصنيف المكتبة<select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">كل التصنيفات</option>
              {Object.entries(categories).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
            </select></label>
          </div> : collections.length ? <>
            <label>المجموعة الصوتية<select value={collectionId} onChange={(e) => {
              preview.stop(); setChosen([]); setCollectionId(e.target.value)
            }}>
              <option value="">اختر مجموعة</option>
              {collections.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
            </select></label>
            {collection && <p className="muted">تُضاف المقاطع بالترتيب المحفوظ. تبقى المقاطع الموجودة في مكانها، ويُحفظ الترتيب مستقلاً عن المجموعة.</p>}
            {unavailable > 0 && <p className="validation">تعذّر تحميل {count.format(unavailable)} من مقاطع المجموعة. حدّث المكتبة أو اختر المقاطع المتاحة.</p>}
          </> : <p className="empty">لا توجد مجموعات. يمكنك إنشاؤها في الصوتيات.</p>}
          <div className="row-actions">
            <p className="muted">{localHint}</p>
            <button type="button" disabled={libraryState === 'loading' || mode === 'local'}
              onClick={() => void refreshLibrary().catch(() => {})}>تحديث المكتبة</button>
          </div>
          {libraryState === 'loading' && <p className="muted" role="status">جارٍ تحميل المكتبة…</p>}
          {libraryState === 'failed' &&
            <p className="validation" role="alert">تعذّر تحديث المكتبة. أعد المحاولة.</p>}
          {open && <PreviewAudio preview={preview.state} />}
          {!results.length && libraryState === 'ready' && (tab === 'library' || collection) &&
            <p className="empty">{mode === 'local' ? 'المكتبة غير متصلة بالمحطة.' : 'لا توجد مقاطع مطابقة.'}</p>}
          <ul className="picker-results">
            {results.map((track) => {
              const inList = ids.includes(track.id)
              const checked = validChoices.includes(track.id)
              return <li key={track.id}>
                <label className="check">
                  <input type="checkbox" checked={checked || inList} disabled={inList || (!checked && validChoices.length >= available)}
                    onChange={(e) => setChosen((previous) => e.target.checked ?
                      [...previous, track.id] : previous.filter((id) => id !== track.id))} />
                  <span><strong dir="auto">{track.title}</strong>
                    <span className="meta-line">{inList ? 'موجود في القائمة' : trackDuration(track.seconds) ?? 'المدة غير معروفة'}</span></span>
                </label>
                <button type="button" className="icon-button" disabled={track.previewable === false}
                  aria-label={(preview.state?.id === track.id ? 'إيقاف الاستماع التجريبي إلى ' : 'استماع تجريبي إلى ') + track.title}
                  onClick={() => void preview.toggle(track)}><Headphones size={18} /></button>
              </li>
            })}
          </ul>
        </div>}
        <div hidden={tab !== 'upload'}>
          <AudioUpload remaining={available} onBusy={(value) => { setUploading(value); onUploadBusy(value) }} onReady={(track) => {
            onUpload(track)
            append([track.id])
          }} />
        </div>
      </div>
      {tab !== 'upload' && <div className="modal-actions">
        <span role="status">{count.format(validChoices.length)} مقطع محدد</span>
        {tab === 'collections' && collection && <button type="button"
          disabled={!candidates.length || Boolean(unavailable) || candidates.length > available || libraryState !== 'ready'}
          onClick={() => finishSelection(candidates)}>إضافة المجموعة كاملة</button>}
        <button type="button" className="primary" disabled={!validChoices.length || validChoices.length > available || uploading}
          onClick={() => finishSelection(validChoices)}>إضافة المحدد إلى القائمة</button>
      </div>}
    </Modal>
  </section>
}
