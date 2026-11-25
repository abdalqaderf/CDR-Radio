import type { ReactNode } from 'react'
import { unknownTitle } from './PlaylistControls'
import type { Track, Workspace } from './radio'

export interface EditorProps {
  library: Track[]
  collections: Workspace['collections']
  libraryState: 'loading' | 'failed' | 'ready'
  onUpload: (track: Track) => void
  refreshLibrary: () => Promise<void>
  refresh: () => Promise<Workspace>
  onDirty: (value: boolean) => void
}

export const sameOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, i) => id === b[i])

export function TrackSummary({ ids, library }: { ids: string[]; library: Track[] }) {
  const titles = new Map(library.map((item) => [item.id, item.title]))
  return <ol className="track-summary" aria-label="ترتيب المقاطع">
    {ids.map((id, i) => <li key={i}><bdi>{titles.get(id) ?? unknownTitle}</bdi></li>)}
  </ol>
}

export function EditorActions({ children, status }: { children: ReactNode; status: string }) {
  return <div className="editor-actions">
    <span className="editor-state" role="status">{status}</span>
    <div className="row-actions">{children}</div>
  </div>
}
