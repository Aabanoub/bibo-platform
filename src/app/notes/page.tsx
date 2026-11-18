'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { Note } from '@/types';
import {
  Plus,
  Search,
  Pin,
  PinOff,
  Trash2,
  Tag,
  X,
  FileText,
  Loader2,
  AlertCircle,
  StickyNote,
  Camera,
  ChevronLeft,
} from 'lucide-react';
import DocumentScannerModal from '@/components/DocumentScannerModal';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function NotesPage() {
  const supabase = createClient();

  // ---- state --------------------------------------------------------------
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);

  const handleSaveScannedNote = async (data: {
    title: string;
    content: string;
    tags: string[];
  }) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    await supabase.from('profiles').upsert(
      {
        id: user.id,
        full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    const { data: newRow, error: insertErr } = await supabase
      .from('notes')
      .insert({
        user_id: user.id,
        title: data.title || 'Scanned Note',
        content: data.content || '',
        tags: data.tags || [],
        is_pinned: false,
      })
      .select()
      .single();

    if (insertErr) throw insertErr;
    if (newRow) {
      setNotes((prev) => [newRow as Note, ...prev]);
      selectNote(newRow as Note);
    }
  };

  // auto-save refs
  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);
  const isAutoSaving = useRef(false);
  const lastSaved = useRef<{ title: string; content: string }>({ title: '', content: '' });

  // ---- fetch notes --------------------------------------------------------
  const fetchNotes = useCallback(async () => {
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const lastResetAt =
        user?.user_metadata?.last_data_reset_at ||
        (typeof window !== 'undefined' ? localStorage.getItem('bibo_last_reset_at') : null);

      let query = supabase.from('notes').select('*');
      if (lastResetAt) {
        query = query.gt('created_at', lastResetAt);
      }

      const { data, error: err } = await query
        .order('is_pinned', { ascending: false })
        .order('updated_at', { ascending: false });

      if (err) throw err;
      setNotes((data as Note[]) ?? []);
    } catch (e: any) {
      const msg = e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to load notes');
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes().then(() => {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        if (params.get('new') === 'true') {
          window.history.replaceState({}, '', '/notes');
          createNote();
        }
      }
    });
  }, [fetchNotes]);

  // ---- auto-save ----------------------------------------------------------
  useEffect(() => {
    if (!selectedId) return;
    if (
      debouncedTitle === lastSaved.current.title &&
      debouncedContent === lastSaved.current.content
    )
      return;
    if (isAutoSaving.current) return;

    const save = async () => {
      isAutoSaving.current = true;
      setSaving(true);
      try {
        const { error: err } = await supabase
          .from('notes')
          .update({ title: debouncedTitle, content: debouncedContent, updated_at: new Date().toISOString() })
          .eq('id', selectedId);
        if (err) throw err;
        lastSaved.current = { title: debouncedTitle, content: debouncedContent };
        setNotes((prev) =>
          prev.map((n) =>
            n.id === selectedId
              ? { ...n, title: debouncedTitle, content: debouncedContent, updated_at: new Date().toISOString() }
              : n,
          ),
        );
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Auto-save failed');
      } finally {
        setSaving(false);
        isAutoSaving.current = false;
      }
    };
    save();
  }, [debouncedTitle, debouncedContent, selectedId]);

  // ---- select note --------------------------------------------------------
  const selectNote = (note: Note) => {
    setSelectedId(note.id);
    setTitle(note.title);
    setContent(note.content ?? '');
    setTags(note.tags ?? []);
    lastSaved.current = { title: note.title, content: note.content ?? '' };
    setDeleteConfirm(null);
  };

  // ---- create note --------------------------------------------------------
  const createNote = async () => {
    try {
      setError(null);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError('Please sign in to create notes.');
        return;
      }

      // Ensure profile row exists to satisfy foreign key constraints
      try {
        await supabase.from('profiles').upsert(
          {
            id: user.id,
            full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          },
          { onConflict: 'id' }
        );
      } catch {}

      const { data, error: err } = await supabase
        .from('notes')
        .insert({
          user_id: user.id,
          title: 'Untitled Note',
          content: '',
          tags: [],
          is_pinned: false,
        })
        .select()
        .single();

      if (err) throw err;
      const note = data as Note;
      setNotes((prev) => [note, ...prev]);
      selectNote(note);
    } catch (e: any) {
      console.error('createNote error:', e);
      const msg = e?.message || e?.error_description || (e instanceof Error ? e.message : 'Failed to create note');
      setError(msg);
    }
  };

  // ---- delete note --------------------------------------------------------
  const deleteNote = async (id: string) => {
    try {
      setError(null);
      const { error: err } = await supabase.from('notes').delete().eq('id', id);
      if (err) throw err;
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedId === id) {
        setSelectedId(null);
        setTitle('');
        setContent('');
        setTags([]);
      }
      setDeleteConfirm(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to delete note');
    }
  };

  // ---- toggle pin ---------------------------------------------------------
  const togglePin = async (note: Note) => {
    try {
      setError(null);
      const { error: err } = await supabase
        .from('notes')
        .update({ is_pinned: !note.is_pinned })
        .eq('id', note.id);
      if (err) throw err;
      setNotes((prev) =>
        prev
          .map((n) => (n.id === note.id ? { ...n, is_pinned: !n.is_pinned } : n))
          .sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
          }),
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update pin');
    }
  };

  // ---- tags ---------------------------------------------------------------
  const addTag = async () => {
    if (!newTag.trim() || !selectedId) return;
    const updated = Array.from(new Set([...tags, newTag.trim().toLowerCase()]));
    setTags(updated);
    setNewTag('');
    try {
      const { error: err } = await supabase.from('notes').update({ tags: updated }).eq('id', selectedId);
      if (err) throw err;
      setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, tags: updated } : n)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to update tags');
    }
  };

  const removeTag = async (tag: string) => {
    if (!selectedId) return;
    const updated = tags.filter((t) => t !== tag);
    setTags(updated);
    try {
      const { error: err } = await supabase.from('notes').update({ tags: updated }).eq('id', selectedId);
      if (err) throw err;
      setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, tags: updated } : n)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to remove tag');
    }
  };

  // ---- filtering ----------------------------------------------------------
  const allTags = Array.from(new Set(notes.flatMap((n) => n.tags ?? [])));

  const filtered = notes.filter((n) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q || n.title.toLowerCase().includes(q) || (n.content ?? '').toLowerCase().includes(q);
    const matchesTag = !filterTag || (n.tags ?? []).includes(filterTag);
    return matchesSearch && matchesTag;
  });

  const selectedNote = notes.find((n) => n.id === selectedId);

  // ---- render -------------------------------------------------------------
  return (
    <div className="h-[calc(100dvh-8rem)] sm:h-[calc(100vh-6.5rem)] flex flex-col md:flex-row rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden shadow-xl text-slate-100">
      {/* Notes List / Sidebar */}
      <aside
        className={`${
          selectedId !== null ? 'hidden md:flex' : 'flex'
        } w-full md:w-80 flex-shrink-0 border-r border-slate-800 flex-col bg-slate-900 h-full`}
      >
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg sm:text-xl font-bold flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-indigo-400" />
              Notes
            </h1>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setScannerOpen(true)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 border border-blue-500/20 transition-colors active:scale-95"
                title="Scan Document or Photo (AI)"
              >
                <Camera className="w-4 h-4" />
              </button>
              <button
                onClick={createNote}
                className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors active:scale-95 flex items-center gap-1"
                title="New Note"
              >
                <Plus className="w-4 h-4" />
                <span className="text-xs font-medium md:hidden pr-1">New</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5 max-h-16 overflow-y-auto">
              {filterTag && (
                <button
                  onClick={() => setFilterTag(null)}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-600 text-white flex items-center gap-1"
                >
                  {filterTag} <X className="w-3 h-3" />
                </button>
              )}
              {allTags
                .filter((t) => t !== filterTag)
                .map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setFilterTag(tag)}
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Note list items */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FileText className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">
                {searchQuery || filterTag ? 'No matching notes' : 'No notes yet'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || filterTag ? 'Try another search or filter' : 'Tap New Note to write your first note'}
              </p>
              {!searchQuery && !filterTag && (
                <button
                  onClick={createNote}
                  className="mt-4 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" /> Create Note
                </button>
              )}
            </div>
          ) : (
            filtered.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                className={`p-3 cursor-pointer transition-colors group relative ${
                  note.id === selectedId
                    ? 'bg-indigo-950/40 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {note.is_pinned && <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                      <p className="text-sm font-semibold truncate text-slate-200">
                        {note.title || 'Untitled Note'}
                      </p>
                    </div>
                    <p className="text-xs text-slate-400 truncate mt-1">
                      {note.content?.slice(0, 90) || 'Empty note'}
                    </p>
                    {(note.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {note.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700/50">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions (visible on mobile touch, hover on desktop) */}
                  <div className="flex items-center gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(note);
                      }}
                      className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition"
                      title={note.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      {note.is_pinned ? (
                        <PinOff className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Pin className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (deleteConfirm === note.id) {
                          deleteNote(note.id);
                        } else {
                          setDeleteConfirm(note.id);
                        }
                      }}
                      className={`p-1.5 rounded-md hover:bg-slate-700 transition ${
                        deleteConfirm === note.id ? 'text-red-400 bg-red-500/10' : 'text-slate-400 hover:text-red-400'
                      }`}
                      title={deleteConfirm === note.id ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {deleteConfirm === note.id && (
                  <p className="text-[10px] text-red-400 mt-1.5 bg-red-500/10 rounded px-2 py-1">
                    Tap trash icon again to permanently delete
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Editor Main Pane */}
      <main
        className={`${
          selectedId === null ? 'hidden md:flex' : 'flex'
        } flex-1 flex-col min-w-0 bg-slate-950/40 h-full overflow-hidden`}
      >
        {error && (
          <div className="mx-3 mt-3 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="ml-auto p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {selectedNote ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Top Toolbar */}
            <div className="flex items-center justify-between border-b border-slate-800/80 px-3 sm:px-6 py-2.5 bg-slate-900/40 shrink-0">
              {/* Back button (Mobile only) */}
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden flex items-center gap-1.5 text-xs font-semibold text-indigo-400 hover:text-indigo-300 py-1 px-2.5 -ml-1 rounded-lg bg-slate-800/70 border border-slate-700 transition active:scale-95"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>All Notes</span>
              </button>

              <div className="flex items-center gap-2 ml-auto">
                {saving && (
                  <span className="text-xs text-slate-400 flex items-center gap-1 mr-2">
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
                    <span className="hidden sm:inline">Saving…</span>
                  </span>
                )}
                <button
                  onClick={() => togglePin(selectedNote)}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                  title={selectedNote.is_pinned ? 'Unpin' : 'Pin'}
                >
                  {selectedNote.is_pinned ? (
                    <PinOff className="w-4 h-4 text-amber-400" />
                  ) : (
                    <Pin className="w-4 h-4" />
                  )}
                </button>
                <button
                  onClick={() => {
                    if (deleteConfirm === selectedNote.id) {
                      deleteNote(selectedNote.id);
                    } else {
                      setDeleteConfirm(selectedNote.id);
                    }
                  }}
                  className={`p-1.5 rounded-lg hover:bg-slate-800 transition ${
                    deleteConfirm === selectedNote.id ? 'text-red-400 bg-red-500/10' : 'text-slate-400 hover:text-red-400'
                  }`}
                  title={deleteConfirm === selectedNote.id ? 'Click again to confirm' : 'Delete note'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Note Body */}
            <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-y-auto">
              {/* Title */}
              <div className="mb-1">
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Note title"
                  className="w-full text-xl sm:text-2xl font-bold bg-transparent border-none outline-none placeholder-slate-600 text-white"
                />
              </div>

              <p className="text-[11px] sm:text-xs text-slate-500 mb-3">
                Updated {new Date(selectedNote.updated_at).toLocaleString()}
              </p>

              {/* Tags */}
              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addTag();
                  }}
                  className="flex items-center"
                >
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag…"
                    className="text-xs bg-slate-800 border border-slate-700 rounded-l px-2 py-1 w-20 sm:w-24 outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-500"
                  />
                  <button
                    type="submit"
                    className="text-xs bg-slate-700 hover:bg-slate-600 border border-l-0 border-slate-700 rounded-r px-2 py-1 transition-colors text-slate-300"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                </form>
              </div>

              {/* Content */}
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Start typing your note here…"
                className="w-full flex-1 bg-transparent border-none outline-none resize-none text-slate-200 text-sm sm:text-base leading-relaxed placeholder-slate-600 min-h-[300px]"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-600">
            <div className="h-16 w-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400 mb-4 shadow-inner">
              <StickyNote className="w-8 h-8" />
            </div>
            <p className="text-base sm:text-lg font-semibold text-slate-300">Select a note or create a new one</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-sm">
              Your thoughts, scanned documents, and knowledge are saved automatically.
            </p>
            <div className="flex items-center gap-2 mt-5">
              <button
                onClick={() => setScannerOpen(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs sm:text-sm font-medium transition border border-blue-500/20 flex items-center gap-1.5"
              >
                <Camera className="w-4 h-4" /> Scan Photo (AI)
              </button>
              <button
                onClick={createNote}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
              >
                <Plus className="w-4 h-4" /> New Note
              </button>
            </div>
          </div>
        )}
      </main>

      <DocumentScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onSaveNote={handleSaveScannedNote}
      />
    </div>
  );
}
