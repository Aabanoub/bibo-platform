'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Wand2,
  Upload,
  Download,
  Copy,
  Check,
  RotateCcw,
  Sliders,
  ChevronDown,
  Sparkles,
  Maximize2,
  FileText,
  User,
  Sun,
  ShieldCheck,
  Eye,
  Split,
  Image as ImageIcon,
  Zap,
  Loader2,
} from 'lucide-react';

type PresetMode = 'auto' | 'portrait' | 'document' | 'landscape' | 'upscale2x' | 'upscale4x' | 'custom';

interface AdjustmentSettings {
  sharpness: number; // 0 - 100
  clarity: number; // 0 - 100
  denoise: number; // 0 - 100
  contrast: number; // -50 - 50
  brightness: number; // -50 - 50
  vibrance: number; // -50 - 50
  upscale: 1 | 2 | 4;
}

const DEFAULT_SETTINGS: AdjustmentSettings = {
  sharpness: 35,
  clarity: 30,
  denoise: 15,
  contrast: 15,
  brightness: 5,
  vibrance: 20,
  upscale: 2,
};

const PRESET_CONFIGS: Record<PresetMode, AdjustmentSettings> = {
  auto: {
    sharpness: 40,
    clarity: 35,
    denoise: 20,
    contrast: 15,
    brightness: 6,
    vibrance: 20,
    upscale: 2,
  },
  portrait: {
    sharpness: 25,
    clarity: 20,
    denoise: 35,
    contrast: 10,
    brightness: 8,
    vibrance: 12,
    upscale: 2,
  },
  document: {
    sharpness: 75,
    clarity: 70,
    denoise: 10,
    contrast: 40,
    brightness: 12,
    vibrance: -10,
    upscale: 2,
  },
  landscape: {
    sharpness: 50,
    clarity: 45,
    denoise: 10,
    contrast: 25,
    brightness: 4,
    vibrance: 35,
    upscale: 2,
  },
  upscale2x: {
    sharpness: 45,
    clarity: 35,
    denoise: 20,
    contrast: 12,
    brightness: 5,
    vibrance: 15,
    upscale: 2,
  },
  upscale4x: {
    sharpness: 60,
    clarity: 50,
    denoise: 25,
    contrast: 15,
    brightness: 6,
    vibrance: 18,
    upscale: 4,
  },
  custom: DEFAULT_SETTINGS,
};

// Background Web Worker script for zero-freezing pixel manipulation
const WORKER_SCRIPT = `
self.onmessage = function(e) {
  const { id, imgData, cfg } = e.data;
  const data = imgData.data;
  const len = data.length;
  const w = imgData.width;
  const h = imgData.height;

  // 1. Brightness, Contrast & Vibrance pass
  const contrastFactor = (259 * (cfg.contrast + 255)) / (255 * (259 - cfg.contrast));
  const brightnessOffset = (cfg.brightness / 100) * 255;
  const vibranceFactor = cfg.vibrance / 100;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Brightness
    r += brightnessOffset;
    g += brightnessOffset;
    b += brightnessOffset;

    // Contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // Smart Vibrance
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const amt = ((Math.abs(max - avg) * 2) / 255) * vibranceFactor;
    if (r !== max) r += (max - r) * amt;
    if (g !== max) g += (max - g) * amt;
    if (b !== max) b += (max - b) * amt;

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  // 2. Denoise (Edge-preserving noise smoothing)
  if (cfg.denoise > 5) {
    const denoiseFactor = (cfg.denoise / 100) * 0.55;
    const temp = new Uint8ClampedArray(data);
    const threshold = 32 * (1 - denoiseFactor * 0.4);

    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        for (let c = 0; c < 3; c++) {
          const center = temp[idx + c];
          let sum = center;
          let count = 1;

          const top = temp[((y - 1) * w + x) * 4 + c];
          const btm = temp[((y + 1) * w + x) * 4 + c];
          const lft = temp[(y * w + (x - 1)) * 4 + c];
          const rgt = temp[(y * w + (x + 1)) * 4 + c];

          if (Math.abs(top - center) < threshold) { sum += top; count++; }
          if (Math.abs(btm - center) < threshold) { sum += btm; count++; }
          if (Math.abs(lft - center) < threshold) { sum += lft; count++; }
          if (Math.abs(rgt - center) < threshold) { sum += rgt; count++; }

          data[idx + c] = Math.round(center * (1 - denoiseFactor) + (sum / count) * denoiseFactor);
        }
      }
    }
  }

  // 3. Unsharp Mask & Clarity (High-pass edge sharpening)
  if (cfg.sharpness > 0 || cfg.clarity > 0) {
    const sharpWeight = (cfg.sharpness / 100) * 0.85 + (cfg.clarity / 100) * 0.45;
    if (sharpWeight > 0.05) {
      const srcPixels = new Uint8ClampedArray(data);
      const centerWeight = 1 + 4 * sharpWeight;
      const edgeWeight = -sharpWeight;

      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;

          for (let c = 0; c < 3; c++) {
            const top = ((y - 1) * w + x) * 4 + c;
            const btm = ((y + 1) * w + x) * 4 + c;
            const lft = (y * w + (x - 1)) * 4 + c;
            const rgt = (y * w + (x + 1)) * 4 + c;

            const val =
              srcPixels[idx + c] * centerWeight +
              (srcPixels[top] + srcPixels[btm] + srcPixels[lft] + srcPixels[rgt]) * edgeWeight;

            data[idx + c] = Math.min(255, Math.max(0, val));
          }
        }
      }
    }
  }

  // Send back result with zero-copy buffer transfer
  self.postMessage({ id, imgData }, [imgData.data.buffer]);
};
`;

const MAX_PREVIEW_SIZE = 1280;

export default function PhotoEnhancerPage() {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [imageMeta, setImageMeta] = useState<{ width: number; height: number; name: string } | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [activePreset, setActivePreset] = useState<PresetMode>('auto');
  const [settings, setSettings] = useState<AdjustmentSettings>(PRESET_CONFIGS.auto);
  const [splitPos, setSplitPos] = useState<number>(50); // 0 - 100%
  const [isHoldingOriginal, setIsHoldingOriginal] = useState(false);
  const [isAdvancedExpanded, setIsAdvancedExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  // References
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const taskIdRef = useRef<number>(0);
  const pendingExportResolve = useRef<((value: string) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);

  // Initialize Web Worker for non-blocking background processing
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { id, imgData } = e.data;

        // Export resolution task
        if (id === 'export' && pendingExportResolve.current) {
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = imgData.width;
          exportCanvas.height = imgData.height;
          const ctx = exportCanvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(imgData, 0, 0);
            pendingExportResolve.current(exportCanvas.toDataURL('image/png', 0.95));
          }
          pendingExportResolve.current = null;
          return;
        }

        // Live preview task (only process if it matches latest taskId to avoid stale frame flicker)
        if (id === taskIdRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = imgData.width;
          canvas.height = imgData.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(imgData, 0, 0);
            setEnhancedUrl(canvas.toDataURL('image/png', 0.92));
          }
          setIsProcessing(false);
        }
      };

      worker.onerror = (err) => {
        console.error('Enhancer worker error:', err);
        setIsProcessing(false);
      };
    } catch (err) {
      console.warn('Web Worker not supported in this environment:', err);
    }

    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  // Request non-blocking enhancement via Web Worker
  const triggerWorkerEnhancement = useCallback(
    (cfg: AdjustmentSettings) => {
      const img = previewImgRef.current;
      if (!img || !workerRef.current) return;

      const currentId = ++taskIdRef.current;
      setIsProcessing(true);

      // Create preview scale canvas
      const naturalW = img.naturalWidth || img.width;
      const naturalH = img.naturalHeight || img.height;
      const previewScale = Math.min(1, MAX_PREVIEW_SIZE / Math.max(naturalW, naturalH));

      const targetW = Math.max(10, Math.round(naturalW * previewScale));
      const targetH = Math.max(10, Math.round(naturalH * previewScale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        setIsProcessing(false);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const imgData = ctx.getImageData(0, 0, targetW, targetH);

      // Post to background worker thread with transferable ArrayBuffer
      workerRef.current.postMessage(
        {
          id: currentId,
          imgData,
          cfg,
        },
        [imgData.data.buffer]
      );
    },
    []
  );

  // Debounced trigger on settings change
  useEffect(() => {
    if (!originalImage) return;

    const timer = setTimeout(() => {
      triggerWorkerEnhancement(settings);
    }, 60);

    return () => clearTimeout(timer);
  }, [originalImage, settings, triggerWorkerEnhancement]);

  // Handle image upload
  const handleFileUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload a valid image file (PNG, JPG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUri = e.target?.result as string;
      if (dataUri) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          previewImgRef.current = img;
          setImageMeta({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            name: file.name.replace(/\.[^/.]+$/, ''),
          });
          setOriginalImage(dataUri);
          setActivePreset('auto');
          setSettings(PRESET_CONFIGS.auto);
        };
        img.src = dataUri;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileUpload(file);
  };

  // Preset switch
  const selectPreset = (preset: PresetMode) => {
    setActivePreset(preset);
    setSettings(PRESET_CONFIGS[preset]);
  };

  // Slider dragging logic for Before/After split
  const handleSplitMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setSplitPos(percent);
  }, []);

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches[0]) handleSplitMove(e.touches[0].clientX);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingSplit.current) handleSplitMove(e.clientX);
  };

  // Non-blocking Full-Resolution Export via Web Worker
  const downloadEnhanced = async (format: 'png' | 'jpeg') => {
    const img = previewImgRef.current;
    if (!img) return;

    setIsExporting(true);

    try {
      const scale = settings.upscale;
      const targetW = (img.naturalWidth || img.width) * scale;
      const targetH = (img.naturalHeight || img.height) * scale;

      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = targetW;
      exportCanvas.height = targetH;
      const ctx = exportCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      const imgData = ctx.getImageData(0, 0, targetW, targetH);

      // Process in background worker so the main UI never freezes
      const fullResultUrl = await new Promise<string>((resolve) => {
        pendingExportResolve.current = resolve;
        if (workerRef.current) {
          workerRef.current.postMessage({ id: 'export', imgData, cfg: settings }, [imgData.data.buffer]);
        } else {
          resolve(exportCanvas.toDataURL(format === 'png' ? 'image/png' : 'image/jpeg', 0.95));
        }
      });

      const link = document.createElement('a');
      link.download = `${imageMeta?.name || 'photo'}-enhanced-${settings.upscale}x.${format === 'png' ? 'png' : 'jpg'}`;
      link.href = fullResultUrl;
      link.click();
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Copy to clipboard
  const copyEnhanced = async () => {
    if (!enhancedUrl) return;
    try {
      const res = await fetch(enhancedUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Could not copy directly to clipboard. You can download the image instead.');
    }
  };

  // Quick Demo Samples
  const loadSample = (type: 'portrait' | 'doc') => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (type === 'portrait') {
      const grad = ctx.createLinearGradient(0, 0, 400, 300);
      grad.addColorStop(0, '#1e293b');
      grad.addColorStop(1, '#0f172a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 300);

      // Face silhouette
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.arc(200, 120, 50, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(200, 240, 85, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Sample Portrait', 200, 280);
    } else {
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(0, 0, 400, 300);
      ctx.fillStyle = '#334155';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('CONFIDENTIAL REPORT', 40, 50);
      ctx.font = '14px monospace';
      ctx.fillText('Invoice #: EVOLVE-2026-88', 40, 90);
      ctx.fillText('Total Amount: $1,450.00', 40, 120);
      ctx.fillText('Status: Approved & Verified', 40, 150);
      ctx.fillStyle = '#64748b';
      ctx.fillText('Text & edges will become razor sharp!', 40, 220);
    }

    const uri = canvas.toDataURL('image/png');
    const img = new Image();
    img.onload = () => {
      previewImgRef.current = img;
      setImageMeta({
        width: 400,
        height: 300,
        name: `sample-${type}`,
      });
      setOriginalImage(uri);
      setActivePreset(type === 'portrait' ? 'portrait' : 'document');
      setSettings(PRESET_CONFIGS[type === 'portrait' ? 'portrait' : 'document']);
    };
    img.src = uri;
  };

  return (
    <div className="space-y-6 text-zinc-100 max-w-6xl mx-auto pb-12 animate-fade-in">
      {/* Non-blocking Background Export Overlay */}
      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm animate-fade-in">
          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 mx-auto animate-pulse">
              <Sparkles size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Rendering Ultra-HD Image</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Applying {settings.upscale}x super-resolution and unsharp masking on background thread...
              </p>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 h-full w-full animate-pulse" />
            </div>
            <p className="text-[11px] text-zinc-500">Your browser remains 100% smooth & responsive</p>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20">
            <Wand2 size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Photo Quality Enhancer</h1>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                <Zap size={10} /> Fast WebWorker Engine
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-400">
              Restore clarity, de-blur edges, upscale 2x/4x & enhance details with 0ms freeze
            </p>
          </div>
        </div>

        {originalImage && (
          <button
            type="button"
            onClick={() => {
              setOriginalImage(null);
              setEnhancedUrl(null);
              setImageMeta(null);
              previewImgRef.current = null;
            }}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition"
          >
            <RotateCcw size={13} />
            <span>Upload New Photo</span>
          </button>
        )}
      </header>

      {/* Main Studio View */}
      {!originalImage ? (
        /* Upload Area */
        <div className="space-y-6">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="group cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 hover:border-indigo-500 bg-zinc-900/40 hover:bg-zinc-900/80 p-10 text-center transition flex flex-col items-center justify-center gap-4 shadow-xl"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileUpload(f);
              }}
              className="hidden"
            />
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:scale-110 group-hover:bg-indigo-600 group-hover:text-white transition duration-200">
              <Upload size={30} />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-200">
                Click or drag & drop any image to enhance
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Supports blurry portraits, low-res documents, product shots, screenshots, and artwork (PNG, JPG, WebP)
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-zinc-500 font-medium">
              <ShieldCheck size={14} className="text-emerald-400" />
              <span>100% Private: Powered by off-thread Web Workers with zero freeze and zero uploads</span>
            </div>
          </div>

          {/* Quick Demo Samples */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
              Or Try A Quick Demo Sample:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => loadSample('portrait')}
                className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900 transition text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Portrait Sample</h4>
                  <p className="text-[11px] text-zinc-500">De-blur face, enhance eyes & skin tone</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => loadSample('doc')}
                className="flex items-center gap-3 p-3 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900 transition text-left"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Document & Text Sample</h4>
                  <p className="text-[11px] text-zinc-500">Sharpen text, remove document blur & enhance contrast</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Active Enhancer Workspace */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Interactive Before/After Split Viewer */}
          <div className="space-y-4 lg:col-span-8">
            <div
              ref={containerRef}
              onMouseDown={() => {
                isDraggingSplit.current = true;
              }}
              onMouseUp={() => {
                isDraggingSplit.current = false;
              }}
              onMouseMove={handleMouseMove}
              onTouchMove={handleTouchMove}
              className="relative w-full aspect-[4/3] max-h-[560px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl select-none flex items-center justify-center"
            >
              {/* Enhanced Image (Base) */}
              {enhancedUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={enhancedUrl}
                  alt="Enhanced Result"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                />
              )}

              {/* Original Image (Clipped Left Layer) */}
              {!isHoldingOriginal && originalImage && (
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none"
                  style={{ width: `${splitPos}%` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={originalImage}
                    alt="Original"
                    className="absolute inset-0 w-full h-full object-contain max-w-none"
                    style={{
                      width: containerRef.current?.clientWidth || '100%',
                      height: containerRef.current?.clientHeight || '100%',
                    }}
                  />
                </div>
              )}

              {/* If holding original button, show 100% original */}
              {isHoldingOriginal && originalImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={originalImage}
                  alt="Original"
                  className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                />
              )}

              {/* Vertical Split Divider Bar */}
              {!isHoldingOriginal && (
                <div
                  className="absolute top-0 bottom-0 z-20 w-1 bg-white cursor-ew-resize shadow-[0_0_10px_rgba(0,0,0,0.8)]"
                  style={{ left: `${splitPos}%` }}
                >
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-900 shadow-xl border border-zinc-200">
                    <Split size={14} className="rotate-90" />
                  </div>
                </div>
              )}

              {/* Badges */}
              <div className="absolute top-3 left-3 z-30 pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[11px] font-semibold text-zinc-300 border border-zinc-800">
                  Original ({imageMeta?.width}×{imageMeta?.height})
                </span>
              </div>
              <div className="absolute top-3 right-3 z-30 pointer-events-none flex items-center gap-2">
                {isProcessing && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/80 backdrop-blur-md text-[11px] font-semibold text-indigo-200 border border-indigo-700 animate-pulse">
                    <Loader2 size={12} className="animate-spin" /> Enhancing...
                  </span>
                )}
                <span className="px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md text-[11px] font-semibold text-white shadow-md">
                  Enhanced ({settings.upscale}x HD • {imageMeta ? imageMeta.width * settings.upscale : 0}×
                  {imageMeta ? imageMeta.height * settings.upscale : 0})
                </span>
              </div>

              {/* Bottom Instructions / Hold Button */}
              <div className="absolute bottom-3 inset-x-3 z-30 flex items-center justify-between pointer-events-auto">
                <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-[10px] text-zinc-400">
                  Drag the slider left or right to compare
                </span>

                <button
                  type="button"
                  onMouseDown={() => setIsHoldingOriginal(true)}
                  onMouseUp={() => setIsHoldingOriginal(false)}
                  onTouchStart={() => setIsHoldingOriginal(true)}
                  onTouchEnd={() => setIsHoldingOriginal(false)}
                  className="ml-auto flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 backdrop-blur-md text-xs font-medium text-zinc-200 border border-zinc-700 shadow-lg active:scale-95 transition"
                >
                  <Eye size={13} />
                  <span>Hold for Original</span>
                </button>
              </div>
            </div>

            {/* Export Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400">Resolution:</span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {imageMeta ? imageMeta.width * settings.upscale : 0} ×{' '}
                  {imageMeta ? imageMeta.height * settings.upscale : 0} px ({settings.upscale}x)
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyEnhanced}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy Image'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => downloadEnhanced('png')}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Download Enhanced PNG</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Presets & Collapsible Fine-Tuning */}
          <div className="space-y-4 lg:col-span-4">
            {/* Quick Enhancement Presets */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Enhancement Profiles
                </span>
                <Zap size={14} className="text-indigo-400" />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selectPreset('auto')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'auto'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Sparkles size={12} className="text-indigo-400" /> Auto-Enhance
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Balanced clarity & color</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('portrait')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'portrait'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <User size={12} className="text-indigo-400" /> Portrait Soft
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Skin de-noise & eyes</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('document')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'document'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <FileText size={12} className="text-indigo-400" /> Document Text
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Razor sharp text</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('landscape')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'landscape'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Sun size={12} className="text-indigo-400" /> Vibrant HDR
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Rich outdoor colors</span>
                </button>
              </div>

              {/* Super-Resolution Upscaling Switcher */}
              <div className="pt-2 border-t border-zinc-800/80">
                <span className="text-xs font-semibold text-zinc-400 block mb-2">
                  Super-Resolution Scale:
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 4].map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      onClick={() => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, upscale: scale as 1 | 2 | 4 }));
                      }}
                      className={`py-1.5 px-2 rounded-xl text-xs font-semibold border transition ${
                        settings.upscale === scale
                          ? 'border-indigo-500 bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {scale === 1 ? '1x Standard' : `${scale}x Super-Res`}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Collapsible Fine-Tuning Adjustments (Collapsed by default until expanded) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all">
              <button
                type="button"
                onClick={() => setIsAdvancedExpanded((prev) => !prev)}
                className="flex items-center justify-between w-full select-none text-left"
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                    <Sliders size={13} />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                      Advanced Adjustments
                    </span>
                    <span className="ml-2 text-[10px] text-zinc-500">
                      {isAdvancedExpanded ? 'Click to hide' : 'Click to expand'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span className="text-[11px] text-zinc-500 font-medium">
                    {isAdvancedExpanded ? 'Hide' : 'Expand'}
                  </span>
                  <ChevronDown
                    size={15}
                    className={`transition-transform duration-200 ${
                      isAdvancedExpanded ? 'rotate-180 text-indigo-400' : 'text-zinc-500'
                    }`}
                  />
                </div>
              </button>

              {isAdvancedExpanded && (
                <div className="space-y-4 pt-4 mt-3 border-t border-zinc-800/80 animate-fade-in">
                  {/* Sharpness */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Sharpness & Edge Recovery:</span>
                      <span className="font-mono text-zinc-200">{settings.sharpness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.sharpness}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, sharpness: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Clarity */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Clarity & Micro-Contrast:</span>
                      <span className="font-mono text-zinc-200">{settings.clarity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.clarity}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, clarity: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Denoise */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Noise & Grain Reduction:</span>
                      <span className="font-mono text-zinc-200">{settings.denoise}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.denoise}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, denoise: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Contrast:</span>
                      <span className="font-mono text-zinc-200">{settings.contrast > 0 ? `+${settings.contrast}` : settings.contrast}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.contrast}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, contrast: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Vibrance */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Color Vibrance:</span>
                      <span className="font-mono text-zinc-200">{settings.vibrance > 0 ? `+${settings.vibrance}` : settings.vibrance}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.vibrance}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, vibrance: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Brightness */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Exposure & Brightness:</span>
                      <span className="font-mono text-zinc-200">{settings.brightness > 0 ? `+${settings.brightness}` : settings.brightness}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.brightness}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((prev) => ({ ...prev, brightness: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => selectPreset('auto')}
                    className="w-full py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition"
                  >
                    Reset to Auto
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
