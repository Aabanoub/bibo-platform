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
} from 'lucide-react';

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

  // auto-save refs
  const debouncedTitle = useDebounce(title, 1000);
  const debouncedContent = useDebounce(content, 1000);
  const isAutoSaving = useRef(false);
  const lastSaved = useRef<{ title: string; content: string }>({ title: '', content: '' });

  // ---- fetch notes --------------------------------------------------------
  const fetchNotes = useCallback(async () => {
    try {
      setError(null);
      const { data, error: err } = await supabase
        .from('notes')
        .select('*')
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
    fetchNotes();
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
    <div className="flex h-screen bg-slate-950 text-slate-100">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 border-r border-slate-800 flex flex-col bg-slate-900">
        {/* Header */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-xl font-bold flex items-center gap-2">
              <StickyNote className="w-5 h-5 text-indigo-400" />
              Notes
            </h1>
            <button
              onClick={createNote}
              className="p-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 transition-colors"
              title="New Note"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search notes…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder-slate-500"
            />
          </div>

          {/* Tag filter */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
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
                    className="text-xs px-2 py-0.5 rounded-full bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
            </div>
          )}
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-4">
              <FileText className="w-10 h-10 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">
                {searchQuery || filterTag ? 'No notes match your search.' : 'No notes yet. Create your first note!'}
              </p>
            </div>
          ) : (
            filtered.map((note) => (
              <div
                key={note.id}
                onClick={() => selectNote(note)}
                className={`p-3 border-b border-slate-800 cursor-pointer transition-colors group ${
                  note.id === selectedId ? 'bg-slate-800' : 'hover:bg-slate-800/50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {note.is_pinned && <Pin className="w-3 h-3 text-amber-400 flex-shrink-0" />}
                      <p className="text-sm font-medium truncate">{note.title || 'Untitled'}</p>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {note.content?.slice(0, 80) || 'No content'}
                    </p>
                    {(note.tags ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {note.tags.map((t) => (
                          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePin(note);
                      }}
                      className="p-1 rounded hover:bg-slate-700"
                      title={note.is_pinned ? 'Unpin' : 'Pin'}
                    >
                      {note.is_pinned ? (
                        <PinOff className="w-3.5 h-3.5 text-amber-400" />
                      ) : (
                        <Pin className="w-3.5 h-3.5 text-slate-400" />
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
                      className={`p-1 rounded hover:bg-slate-700 ${
                        deleteConfirm === note.id ? 'text-red-400' : 'text-slate-400'
                      }`}
                      title={deleteConfirm === note.id ? 'Click again to confirm' : 'Delete'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {deleteConfirm === note.id && (
                  <p className="text-[10px] text-red-400 mt-1">Click delete again to confirm</p>
                )}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Editor */}
      <main className="flex-1 flex flex-col min-w-0">
        {error && (
          <div className="mx-4 mt-4 p-3 rounded-lg bg-red-900/30 border border-red-800 text-red-300 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {selectedNote ? (
          <div className="flex-1 flex flex-col p-6 overflow-y-auto">
            {/* Title */}
            <div className="flex items-center gap-3 mb-1">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Note title"
                className="flex-1 text-2xl font-bold bg-transparent border-none outline-none placeholder-slate-600"
              />
              {saving && (
                <span className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 mb-4">
              Last updated {new Date(selectedNote.updated_at).toLocaleString()}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-slate-500" />
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 rounded-full bg-indigo-600/30 text-indigo-300 flex items-center gap-1"
                >
                  {tag}
                  <button onClick={() => removeTag(tag)}>
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
                  className="text-xs bg-slate-800 border border-slate-700 rounded-l px-2 py-1 w-24 outline-none focus:ring-1 focus:ring-indigo-500 placeholder-slate-600"
                />
                <button
                  type="submit"
                  className="text-xs bg-slate-700 hover:bg-slate-600 border border-l-0 border-slate-700 rounded-r px-2 py-1 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </form>
            </div>

            {/* Content */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Start writing…"
              className="flex-1 bg-transparent border-none outline-none resize-none text-slate-300 leading-relaxed placeholder-slate-700 min-h-[300px]"
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-600">
            <StickyNote className="w-16 h-16 mb-4 text-slate-700" />
            <p className="text-lg font-medium">Select a note or create a new one</p>
            <p className="text-sm mt-1">Your thoughts, ideas, and knowledge — all in one place.</p>
            <button
              onClick={createNote}
              className="mt-6 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> New Note
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
