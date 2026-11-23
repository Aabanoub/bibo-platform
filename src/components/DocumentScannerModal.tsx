'use client';

import { useState, useRef } from 'react';
import { FileText, Upload, X, Check, Loader2, Sparkles } from 'lucide-react';

interface ExtractedDoc {
  title: string;
  summary: string;
  action_items: string[];
  tags: string[];
  markdown_content: string;
}

interface DocumentScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveNote: (note: {
    title: string;
    content: string;
    tags: string[];
  }) => Promise<void>;
}

export default function DocumentScannerModal({
  isOpen,
  onClose,
  onSaveNote,
}: DocumentScannerModalProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [extractedDoc, setExtractedDoc] = useState<ExtractedDoc | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setError(null);
    setExtractedDoc(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const scanDocument = async () => {
    if (!imageFile) return;

    setIsScanning(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('mode', 'document');

      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to scan document');
      }

      const resJson = await res.json();
      const extracted = resJson.data;

      setExtractedDoc({
        title: extracted.title || 'Scanned Document',
        summary: extracted.summary || '',
        action_items: Array.isArray(extracted.action_items) ? extracted.action_items : [],
        tags: Array.isArray(extracted.tags) ? extracted.tags : ['scanned'],
        markdown_content:
          extracted.markdown_content || extracted.summary || 'No text extracted.',
      });
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Vision AI could not read the document.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!extractedDoc) return;
    setIsSaving(true);
    try {
      let finalContent = extractedDoc.markdown_content;
      if (extractedDoc.action_items?.length > 0) {
        finalContent += `\n\n### Action Items\n` + extractedDoc.action_items.map((a) => `- [ ] ${a}`).join('\n');
      }

      await onSaveNote({
        title: extractedDoc.title,
        content: finalContent,
        tags: extractedDoc.tags,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save note');
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => {
    setImagePreview(null);
    setImageFile(null);
    setExtractedDoc(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400">
              <FileText size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">AI Document & Note Scanner</h2>
              <p className="text-xs text-zinc-400">Extract notes, text & tasks from paper or screen</p>
            </div>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 p-8 text-center transition hover:border-blue-500/50 hover:bg-zinc-950"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400 mb-3">
                <Upload size={24} />
              </div>
              <p className="text-sm font-medium text-zinc-200">
                Upload document or photo
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Handwritten notes, book pages, whiteboard photos, receipts
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative max-h-48 overflow-hidden rounded-xl border border-zinc-800 bg-black/40 flex items-center justify-center">
                <img
                  src={imagePreview}
                  alt="Doc Preview"
                  className="max-h-48 object-contain"
                />
                <button
                  onClick={reset}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-zinc-300 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {!extractedDoc && (
                <button
                  type="button"
                  onClick={scanDocument}
                  disabled={isScanning}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Vision AI Reading & Summarizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>Extract Notes & Action Items</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Extracted Details */}
          {extractedDoc && (
            <div className="space-y-3 rounded-xl border border-blue-500/20 bg-blue-950/20 p-4">
              <div>
                <label className="text-xs text-zinc-400 block font-medium">Title:</label>
                <input
                  type="text"
                  value={extractedDoc.title}
                  onChange={(e) =>
                    setExtractedDoc({ ...extractedDoc, title: e.target.value })
                  }
                  className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100"
                />
              </div>

              <div>
                <label className="text-xs text-zinc-400 block font-medium">Extracted Notes (Markdown):</label>
                <textarea
                  rows={5}
                  value={extractedDoc.markdown_content}
                  onChange={(e) =>
                    setExtractedDoc({ ...extractedDoc, markdown_content: e.target.value })
                  }
                  className="w-full mt-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-100 font-mono"
                />
              </div>

              {extractedDoc.action_items?.length > 0 && (
                <div>
                  <span className="text-xs text-amber-400 font-medium block">
                    Detected Tasks:
                  </span>
                  <ul className="mt-1 space-y-1 text-xs text-zinc-300">
                    {extractedDoc.action_items.map((item, idx) => (
                      <li key={idx} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                <span>{isSaving ? 'Saving to Notes...' : 'Save to Notes'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
