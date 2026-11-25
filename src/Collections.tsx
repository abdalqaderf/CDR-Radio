import { useState } from 'react'
import { FolderPlus } from 'lucide-react'
import { TaskNotice, useEditorGuard, useTask } from './AdminFeedback'
import { EditorActions, sameOrder, TrackSummary, type EditorProps } from './EditorContent'
import { count } from './PlaylistControls'
import { saveCollection, type Playlist } from './radio'
import { TrackOrder } from './TrackOrder'

export function Collections(props: EditorProps & { onSaved: (collection: Playlist) => void }) {
  const [list, setList] = useState<Playlist | null>(null)
  if (list) return <CollectionEditor key={list.id} {...props} initial={list} close={() => setList(null)} />
  return <section className="state-panel">
    <div className="panel-heading">
      <h2>المجموعات الصوتية</h2>
      <button className="primary" type="button" onClick={() => setList({
        id: crypto.randomUUID(), title: '', revision: 0, tracks: [],
      })}><FolderPlus size={18} /> إنشاء مجموعة</button>
    </div>
    <p className="muted">يمكن استخدام الملف نفسه في أكثر من مجموعة. تُنسخ المقاطع عند إضافتها إلى البث أو البرنامج.</p>
    {props.collections.length ? <ul className="library">
      {props.collections.map((item) => <li key={item.id} className="saved">
        <div className="panel-heading">
          <div><strong dir="auto">{item.title}</strong><p className="meta-line">{count.format(item.tracks.length)} مقطع</p></div>
          <button type="button" aria-label={'تحرير مجموعة ' + item.title} onClick={() => setList(item)}>تحرير المجموعة</button>
        </div>
      </li>)}
    </ul> : <p className="empty">لا توجد مجموعات صوتية بعد.</p>}
  </section>
}

function CollectionEditor({ initial, onSaved, close, ...props }: EditorProps & {
  initial: Playlist
  onSaved: (collection: Playlist) => void
  close: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [ids, setIds] = useState(initial.tracks)
  const [conflict, setConflict] = useState<Playlist | null>(null)
  const [uploading, setUploading] = useState(false)
  const task = useTask()
  const busy = task.busy || uploading
  const dirty = title.trim() !== saved.title || !sameOrder(ids, saved.tracks)
  useEditorGuard(dirty || busy, props.onDirty)

  async function persist() {
    const snapshot = { id: saved.id, title: title.trim(), tracks: ids }
    let observed
    try {
      const revision = await saveCollection(saved.id, saved.revision, snapshot)
      observed = { ...snapshot, revision }
    } catch (error) {
      const latest = (await props.refresh().catch(() => null))?.collections.find((item) => item.id === saved.id)
      if (latest && latest.title === snapshot.title && sameOrder(latest.tracks, ids)) observed = latest
      else {
        if (latest && latest.revision !== saved.revision) setConflict(latest)
        throw error
      }
    }
    setSaved(observed)
    onSaved(observed)
    return 'حُفظت المجموعة.'
  }

  function resolve(useLatest: boolean) {
    if (!conflict) return
    if (useLatest) {
      setTitle(conflict.title)
      setIds(conflict.tracks)
    }
    setSaved(conflict)
    setConflict(null)
  }

  return <section className="state-panel playlist-editor">
    <div className="panel-heading">
      <h2>{saved.revision ? 'تحرير المجموعة الصوتية' : 'مجموعة صوتية جديدة'}</h2>
      <button type="button" disabled={busy} onClick={() => {
        if (!dirty || confirm('هل تريد العودة وترك تعديلات المجموعة غير المحفوظة؟')) close()
      }}>العودة إلى المجموعات</button>
    </div>
    <form onSubmit={(event) => {
      event.preventDefault()
      if (!busy && dirty && title.trim() && !conflict) void task.run(persist)
    }}>
      <label>اسم المجموعة<input required maxLength={150} dir="auto" disabled={busy} value={title}
        onChange={(event) => setTitle(event.target.value)} /></label>
      <fieldset disabled={task.busy}>
        <TrackOrder {...props} collections={props.collections.filter((item) => item.id !== saved.id)}
          ids={ids} onChange={setIds} resetKey={String(saved.revision)} onUploadBusy={setUploading} />
      </fieldset>
      <TaskNotice task={task} waiting="جارٍ حفظ المجموعة…" />
      {conflict && <div className="publication-note">
        <p>المجموعة المحفوظة الأحدث · <bdi>{conflict.title}</bdi></p>
        <TrackSummary ids={conflict.tracks} library={props.library} />
        <div className="row-actions">
          <button type="button" disabled={busy} onClick={() => resolve(true)}>استخدام المجموعة المحفوظة</button>
          <button type="button" disabled={busy} onClick={() => resolve(false)}>الاحتفاظ بتعديلاتي لمراجعتها</button>
        </div>
      </div>}
      <EditorActions status={dirty ? 'تغييرات غير محفوظة' : saved.revision ? 'المجموعة محفوظة' : 'مجموعة جديدة'}>
        <button type="submit" className="primary" disabled={!dirty || !title.trim() || busy || Boolean(conflict)}>حفظ المجموعة</button>
      </EditorActions>
    </form>
  </section>
}
