'use client';

import { useState, useRef } from 'react';
import { Camera, Upload, X, Check, Loader2, Sparkles, DollarSign } from 'lucide-react';

interface ReceiptData {
  vendor: string;
  amount: number;
  currency: string;
  date: string;
  originalReceiptDate?: string;
  category: string;
  description: string;
}

function parseCleanAmount(val: any): number {
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.abs(val);
  if (!val) return 0;
  let str = String(val).trim();
  // Handle European comma decimals like "25,50"
  if (/^\D*\d+,\d{2}\D*$/.test(str)) {
    str = str.replace(',', '.');
  }
  const cleaned = str.replace(/[^0-9.-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.abs(num);
}

function parseCleanDate(rawDate?: string): { finalDate: string; originalReceiptDate?: string } {
  const todayStr = new Date().toISOString().split('T')[0];
  if (!rawDate || typeof rawDate !== 'string') {
    return { finalDate: todayStr };
  }

  const trimmed = rawDate.trim();
  let candidate = '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    candidate = trimmed;
  } else if (/^\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{4}$/.test(trimmed)) {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      candidate = d.toISOString().split('T')[0];
    }
  } else {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      candidate = d.toISOString().split('T')[0];
    }
  }

  if (!candidate) {
    return { finalDate: todayStr };
  }

  const currentMonthPrefix = todayStr.slice(0, 7);
  const isDifferentMonth = !candidate.startsWith(currentMonthPrefix);

  return {
    finalDate: isDifferentMonth ? todayStr : candidate,
    originalReceiptDate: isDifferentMonth ? candidate : undefined,
  };
}

interface ReceiptScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTransaction: (transaction: {
    amount: number;
    type: 'expense';
    category: string;
    description: string;
    date: string;
  }) => Promise<void>;
}

export default function ReceiptScannerModal({
  isOpen,
  onClose,
  onSaveTransaction,
}: ReceiptScannerModalProps) {
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scannedData, setScannedData] = useState<ReceiptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImageFile(file);
    setError(null);
    setScannedData(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      setImagePreview(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const scanReceipt = async () => {
    if (!imageFile) return;

    setIsScanning(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('mode', 'receipt');

      const res = await fetch('/api/ai/vision', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to scan receipt');
      }

      const resJson = await res.json();
      const extracted = resJson.data || {};

      const dateInfo = parseCleanDate(extracted.date);
      const parsedAmount = parseCleanAmount(extracted.amount);

      setScannedData({
        vendor: extracted.vendor || 'Unknown Merchant',
        amount: parsedAmount,
        currency: extracted.currency || '$',
        date: dateInfo.finalDate,
        originalReceiptDate: dateInfo.originalReceiptDate,
        category: extracted.category || 'Food',
        description: extracted.description || extracted.vendor || 'Receipt Expense',
      });
    } catch (err: any) {
      console.error('Scan error:', err);
      setError(err.message || 'Vision AI could not read the receipt clearly.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!scannedData) return;
    const finalAmount = Math.abs(Number(scannedData.amount)) || 0;
    if (finalAmount <= 0) {
      setError('Please specify a valid expense amount greater than 0.');
      return;
    }
    setIsSaving(true);
    try {
      await onSaveTransaction({
        amount: finalAmount,
        type: 'expense',
        category: scannedData.category || 'Other',
        description: `${scannedData.vendor} - ${scannedData.description}`,
        date: scannedData.date || new Date().toISOString().split('T')[0],
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save transaction');
    } finally {
      setIsSaving(false);
    }
  };

  const reset = () => {
    setImagePreview(null);
    setImageFile(null);
    setScannedData(null);
    setError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
              <Camera size={20} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-100">AI Receipt Scanner</h2>
              <p className="text-xs text-zinc-400">Scan paper bills & receipts with Vision AI</p>
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
        <div className="p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
              {error}
            </div>
          )}

          {!imagePreview ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-700 bg-zinc-950/50 p-8 text-center transition hover:border-emerald-500/50 hover:bg-zinc-950"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                <Upload size={24} />
              </div>
              <p className="text-sm font-medium text-zinc-200">
                Click to upload receipt photo
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                Supports JPG, PNG, WebP from phone camera or file
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
              <div className="relative max-h-56 overflow-hidden rounded-xl border border-zinc-800 bg-black/40 flex items-center justify-center">
                <img
                  src={imagePreview}
                  alt="Receipt Preview"
                  className="max-h-56 object-contain"
                />
                <button
                  onClick={reset}
                  className="absolute top-2 right-2 rounded-full bg-black/60 p-1 text-zinc-300 hover:text-white"
                >
                  <X size={16} />
                </button>
              </div>

              {!scannedData && (
                <button
                  type="button"
                  onClick={scanReceipt}
                  disabled={isScanning}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isScanning ? (
                    <>
                      <Loader2 size={18} className="animate-spin" />
                      <span>Vision AI Analyzing Receipt...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={18} />
                      <span>Extract Details with AI</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Scanned Results Preview */}
          {scannedData && (
            <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Extracted Receipt Details
                </span>
                <span className="flex items-center text-sm font-bold text-white">
                  <DollarSign size={16} className="text-emerald-400" />
                  {scannedData.amount.toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-zinc-500 block">Merchant:</span>
                  <input
                    type="text"
                    value={scannedData.vendor}
                    onChange={(e) =>
                      setScannedData({ ...scannedData, vendor: e.target.value })
                    }
                    className="w-full mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                  />
                </div>
                <div>
                  <span className="text-zinc-500 block">Category:</span>
                  <input
                    type="text"
                    value={scannedData.category}
                    onChange={(e) =>
                      setScannedData({ ...scannedData, category: e.target.value })
                    }
                    className="w-full mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 block">Date:</span>
                    {scannedData.originalReceiptDate && (
                      <button
                        type="button"
                        onClick={() => {
                          const isUsingOriginal = scannedData.date === scannedData.originalReceiptDate;
                          const today = new Date().toISOString().split('T')[0];
                          setScannedData({
                            ...scannedData,
                            date: isUsingOriginal ? today : scannedData.originalReceiptDate!,
                          });
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 underline"
                      >
                        {scannedData.date === scannedData.originalReceiptDate
                          ? 'Set to Today'
                          : `Use Receipt Date`}
                      </button>
                    )}
                  </div>
                  <input
                    type="date"
                    value={scannedData.date}
                    onChange={(e) =>
                      setScannedData({ ...scannedData, date: e.target.value })
                    }
                    className="w-full mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                  />
                  {scannedData.originalReceiptDate && (
                    <span className="text-[10px] text-zinc-500 block mt-0.5">
                      Receipt date: {scannedData.originalReceiptDate}
                    </span>
                  )}
                </div>
                <div>
                  <span className="text-zinc-500 block">Amount:</span>
                  <input
                    type="number"
                    step="0.01"
                    value={scannedData.amount}
                    onChange={(e) =>
                      setScannedData({
                        ...scannedData,
                        amount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100"
                  />
                </div>
              </div>

              <div>
                <span className="text-zinc-500 text-xs block">Description / Items:</span>
                <input
                  type="text"
                  value={scannedData.description}
                  onChange={(e) =>
                    setScannedData({ ...scannedData, description: e.target.value })
                  }
                  className="w-full mt-0.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                />
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="w-full mt-2 flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Check size={16} />
                )}
                <span>{isSaving ? 'Logging Expense...' : 'Confirm & Log Expense'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
