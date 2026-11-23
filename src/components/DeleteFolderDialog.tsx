'use client';

import React, { useState } from 'react';
import type { TaskFolder } from '@/types';
import { AlertCircle, Trash2, X, Loader2, ArrowRight } from 'lucide-react';

interface DeleteFolderDialogProps {
  isOpen: boolean;
  folder: TaskFolder | null;
  taskCount: number;
  onClose: () => void;
  onConfirm: (deleteTasksToo: boolean) => Promise<void>;
}

export default function DeleteFolderDialog({
  isOpen,
  folder,
  taskCount,
  onClose,
  onConfirm,
}: DeleteFolderDialogProps) {
  const [loading, setLoading] = useState(false);
  const [deleteTasksToo, setDeleteTasksToo] = useState(false);

  if (!isOpen || !folder) return null;

  const handleConfirm = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onConfirm(deleteTasksToo);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md p-5 sm:p-6 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Delete Folder</h3>
              <p className="text-xs text-slate-400">Remove &quot;{folder.name}&quot;</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-40 disabled:pointer-events-none"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="py-4 space-y-4">
          <p className="text-xs sm:text-sm text-slate-300">
            Are you sure you want to delete the folder <strong className="text-white">&quot;{folder.name}&quot;</strong>?
          </p>

          {taskCount > 0 ? (
            <div className="p-3.5 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-3">
              <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>This folder currently contains {taskCount} lesson(s) / task(s).</span>
              </div>

              <div className="space-y-2 pt-1 text-xs">
                <label className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-slate-700/40 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="deleteChoice"
                    checked={!deleteTasksToo}
                    onChange={() => setDeleteTasksToo(false)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <span className="font-semibold text-white block">Keep tasks (Recommended)</span>
                    <span className="text-slate-400 text-[11px]">
                      Your {taskCount} tasks remain intact in your general task list.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-2.5 p-2 rounded-xl hover:bg-red-950/30 cursor-pointer transition-colors">
                  <input
                    type="radio"
                    name="deleteChoice"
                    checked={deleteTasksToo}
                    onChange={() => setDeleteTasksToo(true)}
                    className="mt-0.5 accent-red-500"
                  />
                  <div>
                    <span className="font-semibold text-red-300 block">Delete folder and all {taskCount} tasks</span>
                    <span className="text-red-400/80 text-[11px]">
                      Permanently wipes the folder and its contents.
                    </span>
                  </div>
                </label>
              </div>
            </div>
          ) : (
            <p className="text-xs text-slate-400">
              This folder is currently empty.
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:pointer-events-none text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed text-white transition-colors flex items-center gap-1.5 shadow-lg shadow-red-600/30"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>{loading ? 'Deleting Folder...' : 'Confirm Delete'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
