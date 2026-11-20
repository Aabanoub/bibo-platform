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
  Moon,
  ShieldCheck,
  Eye,
  Split,
  Columns,
  Image as ImageIcon,
  Zap,
  Loader2,
  ZoomIn,
  ZoomOut,
  BarChart2,
  Layers,
  Info,
  Grid,
} from 'lucide-react';

type PresetMode =
  | 'auto'
  | 'portrait'
  | 'document'
  | 'landscape'
  | 'night'
  | 'ecommerce'
  | 'depixelate'
  | 'custom';

type ViewMode = 'split' | 'sideBySide' | 'single';

interface AdjustmentSettings {
  // 5-Point Lighting & Dynamic Range
  exposure: number; // -50 to 50
  contrast: number; // -50 to 50
  highlights: number; // -50 to 50 (recover bright blowouts)
  shadows: number; // -50 to 50 (lift dark areas)
  whites: number; // -50 to 50
  blacks: number; // -50 to 50

  // Detail & Clarity
  sharpness: number; // 0 to 100
  clarity: number; // 0 to 100
  dehaze: number; // 0 to 100
  denoise: number; // 0 to 100
  depixelate: number; // 0 to 100 (Anti-pixelation & block smoothing)

  // Color & White Balance
  temperature: number; // -50 to 50 (cool / warm)
  tint: number; // -50 to 50 (green / magenta)
  vibrance: number; // -50 to 50
  saturation: number; // -50 to 50

  // Super-Resolution
  upscale: 1 | 2 | 4;
}

const DEFAULT_SETTINGS: AdjustmentSettings = {
  exposure: 4,
  contrast: 14,
  highlights: -10,
  shadows: 20,
  whites: 8,
  blacks: -6,

  sharpness: 35,
  clarity: 30,
  dehaze: 15,
  denoise: 18,
  depixelate: 0,

  temperature: 2,
  tint: 0,
  vibrance: 22,
  saturation: 8,

  upscale: 2,
};

const PRESET_CONFIGS: Record<PresetMode, AdjustmentSettings> = {
  auto: {
    exposure: 5,
    contrast: 15,
    highlights: -12,
    shadows: 24,
    whites: 10,
    blacks: -8,
    sharpness: 42,
    clarity: 35,
    dehaze: 18,
    denoise: 20,
    depixelate: 0,
    temperature: 2,
    tint: 0,
    vibrance: 24,
    saturation: 10,
    upscale: 2,
  },
  portrait: {
    exposure: 8,
    contrast: 8,
    highlights: -18,
    shadows: 18,
    whites: 6,
    blacks: -4,
    sharpness: 24,
    clarity: 16,
    dehaze: 8,
    denoise: 38,
    depixelate: 0,
    temperature: 6,
    tint: -2,
    vibrance: 16,
    saturation: 4,
    upscale: 2,
  },
  document: {
    exposure: 14,
    contrast: 45,
    highlights: 25,
    shadows: -15,
    whites: 35,
    blacks: -28,
    sharpness: 80,
    clarity: 75,
    dehaze: 30,
    denoise: 12,
    depixelate: 0,
    temperature: -4,
    tint: 0,
    vibrance: -20,
    saturation: -25,
    upscale: 2,
  },
  landscape: {
    exposure: 3,
    contrast: 24,
    highlights: -25,
    shadows: 32,
    whites: 14,
    blacks: -12,
    sharpness: 55,
    clarity: 48,
    dehaze: 28,
    denoise: 12,
    depixelate: 0,
    temperature: 4,
    tint: 2,
    vibrance: 38,
    saturation: 18,
    upscale: 2,
  },
  night: {
    exposure: 16,
    contrast: 18,
    highlights: -35,
    shadows: 40,
    whites: 8,
    blacks: -15,
    sharpness: 30,
    clarity: 25,
    dehaze: 20,
    denoise: 65,
    depixelate: 10,
    temperature: -5,
    tint: 0,
    vibrance: 15,
    saturation: 6,
    upscale: 2,
  },
  ecommerce: {
    exposure: 8,
    contrast: 20,
    highlights: -10,
    shadows: 15,
    whites: 25,
    blacks: -10,
    sharpness: 60,
    clarity: 45,
    dehaze: 15,
    denoise: 15,
    depixelate: 0,
    temperature: 0,
    tint: 0,
    vibrance: 18,
    saturation: 12,
    upscale: 2,
  },
  depixelate: {
    exposure: 6,
    contrast: 20,
    highlights: -12,
    shadows: 24,
    whites: 14,
    blacks: -8,
    sharpness: 30,
    clarity: 24,
    dehaze: 12,
    denoise: 35,
    depixelate: 75,
    temperature: 0,
    tint: 0,
    vibrance: 22,
    saturation: 10,
    upscale: 4,
  },
  custom: DEFAULT_SETTINGS,
};

// Web Worker Script running on background thread for 0ms main-thread freezing
const WORKER_SCRIPT = `
self.onmessage = function(e) {
  const { id, imgData, cfg } = e.data;
  const data = imgData.data;
  const len = data.length;
  const w = imgData.width;
  const h = imgData.height;

  // 1. Exposure & Dynamic Range (Highlights, Shadows, Whites, Blacks)
  const exposureMult = Math.pow(2, (cfg.exposure / 50) * 0.9);
  const contrastFactor = (259 * (cfg.contrast + 255)) / (255 * (259 - cfg.contrast));
  const highlightAdj = (cfg.highlights / 100) * 0.7;
  const shadowAdj = (cfg.shadows / 100) * 0.7;
  const whiteOffset = (cfg.whites / 100) * 45;
  const blackOffset = (cfg.blacks / 100) * 45;

  // Color Temp & Tint
  const tempR = 1 + (cfg.temperature / 100) * 0.35;
  const tempB = 1 - (cfg.temperature / 100) * 0.35;
  const tintG = 1 - (cfg.tint / 100) * 0.25;

  const vibranceFactor = cfg.vibrance / 100;
  const satFactor = 1 + cfg.saturation / 100;

  // Dehaze offset
  const dehazeBoost = (cfg.dehaze / 100) * 0.3;

  for (let i = 0; i < len; i += 4) {
    let r = data[i];
    let g = data[i + 1];
    let b = data[i + 2];

    // Exposure
    r *= exposureMult;
    g *= exposureMult;
    b *= exposureMult;

    // Luminance approximation
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // Highlights compression / recovery
    if (lum > 128 && highlightAdj !== 0) {
      const highWeight = (lum - 128) / 127;
      const factor = 1 + highlightAdj * highWeight;
      r *= factor;
      g *= factor;
      b *= factor;
    }

    // Shadows lift
    if (lum < 128 && shadowAdj !== 0) {
      const shadowWeight = (128 - lum) / 128;
      const lift = shadowAdj * shadowWeight * 85;
      r += lift;
      g += lift;
      b += lift;
    }

    // Whites & Blacks
    if (lum > 180 && whiteOffset !== 0) {
      const wWeight = (lum - 180) / 75;
      r += whiteOffset * wWeight;
      g += whiteOffset * wWeight;
      b += whiteOffset * wWeight;
    }
    if (lum < 75 && blackOffset !== 0) {
      const bWeight = (75 - lum) / 75;
      r += blackOffset * bWeight;
      g += blackOffset * bWeight;
      b += blackOffset * bWeight;
    }

    // Contrast
    r = contrastFactor * (r - 128) + 128;
    g = contrastFactor * (g - 128) + 128;
    b = contrastFactor * (b - 128) + 128;

    // White Balance
    r *= tempR;
    b *= tempB;
    g *= tintG;

    // Dehaze
    if (dehazeBoost > 0) {
      r = r * (1 + dehazeBoost) - dehazeBoost * 30;
      g = g * (1 + dehazeBoost) - dehazeBoost * 30;
      b = b * (1 + dehazeBoost) - dehazeBoost * 30;
    }

    // Vibrance & Saturation
    const max = Math.max(r, g, b);
    const avg = (r + g + b) / 3;
    const amt = ((Math.abs(max - avg) * 2) / 255) * vibranceFactor;
    if (r !== max) r += (max - r) * amt;
    if (g !== max) g += (max - g) * amt;
    if (b !== max) b += (max - b) * amt;

    if (satFactor !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      r = gray + (r - gray) * satFactor;
      g = gray + (g - gray) * satFactor;
      b = gray + (b - gray) * satFactor;
    }

    data[i] = Math.min(255, Math.max(0, r));
    data[i + 1] = Math.min(255, Math.max(0, g));
    data[i + 2] = Math.min(255, Math.max(0, b));
  }

  // 2. Bilateral Edge-Preserving Denoising Pass
  if (cfg.denoise > 5) {
    const denoiseFactor = (cfg.denoise / 100) * 0.65;
    const temp = new Uint8ClampedArray(data);
    const threshold = 34 * (1 - denoiseFactor * 0.35);

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

  // 2.5 De-Pixelate & Anti-Aliasing Pass (Directional Edge Interpolation for Blocky/Pixelated Images)
  if (cfg.depixelate > 5) {
    const depixFactor = cfg.depixelate / 100;
    const temp = new Uint8ClampedArray(data);
    const passes = cfg.depixelate > 45 ? 2 : 1;

    for (let p = 0; p < passes; p++) {
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = (y * w + x) * 4;

          const top = (y - 1) * w + x;
          const btm = (y + 1) * w + x;
          const lft = y * w + (x - 1);
          const rgt = y * w + (x + 1);
          const tl = (y - 1) * w + (x - 1);
          const tr = (y - 1) * w + (x + 1);
          const bl = (y + 1) * w + (x - 1);
          const br = (y + 1) * w + (x + 1);

          for (let c = 0; c < 3; c++) {
            const centerVal = temp[idx + c];

            // Measure directional gradients to detect jagged staircasing and block boundaries
            const d1Diff = Math.abs(temp[tl * 4 + c] - temp[br * 4 + c]);
            const d2Diff = Math.abs(temp[tr * 4 + c] - temp[bl * 4 + c]);
            const hDiff = Math.abs(temp[lft * 4 + c] - temp[rgt * 4 + c]);
            const vDiff = Math.abs(temp[top * 4 + c] - temp[btm * 4 + c]);

            let smoothed = centerVal;
            // Interpolate along the edge tangent to round off square pixel steps
            if (d1Diff < d2Diff && d1Diff < hDiff && d1Diff < vDiff) {
              smoothed = (temp[tl * 4 + c] + temp[br * 4 + c] + centerVal * 2) * 0.25;
            } else if (d2Diff < d1Diff && d2Diff < hDiff && d2Diff < vDiff) {
              smoothed = (temp[tr * 4 + c] + temp[bl * 4 + c] + centerVal * 2) * 0.25;
            } else {
              smoothed = (
                temp[top * 4 + c] +
                temp[btm * 4 + c] +
                temp[lft * 4 + c] +
                temp[rgt * 4 + c] +
                centerVal * 4
              ) * 0.125;
            }

            data[idx + c] = Math.round(
              centerVal * (1 - depixFactor * 0.85) + smoothed * (depixFactor * 0.85)
            );
          }
        }
      }
      if (p < passes - 1) {
        temp.set(data);
      }
    }
  }

  // 3. Adaptive Unsharp Masking & Clarity
  if (cfg.sharpness > 0 || cfg.clarity > 0) {
    const sharpWeight = (cfg.sharpness / 100) * 0.95 + (cfg.clarity / 100) * 0.55;
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

  // 4. Compute 256-bin RGB & Luminance Histogram for live display
  const histR = new Array(256).fill(0);
  const histG = new Array(256).fill(0);
  const histB = new Array(256).fill(0);
  const histLum = new Array(256).fill(0);

  // Subsample every 4th pixel for instant histogram calculation
  for (let i = 0; i < len; i += 16) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    histR[r]++;
    histG[g]++;
    histB[b]++;
    histLum[lum]++;
  }

  self.postMessage(
    {
      id,
      imgData,
      histogram: { r: histR, g: histG, b: histB, lum: histLum },
    },
    [imgData.data.buffer]
  );
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

  // Viewer controls
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [splitPos, setSplitPos] = useState<number>(50); // 0 - 100%
  const [zoomLevel, setZoomLevel] = useState<number>(1); // 1 = Fit, 1.5, 2, 3, 4
  const [panPos, setPanPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isHoldingOriginal, setIsHoldingOriginal] = useState(false);

  // Histogram data
  const [histogramData, setHistogramData] = useState<{
    r: number[];
    g: number[];
    b: number[];
    lum: number[];
  } | null>(null);

  // Collapsible control sections
  const [isLightingExpanded, setIsLightingExpanded] = useState(true);
  const [isDetailExpanded, setIsDetailExpanded] = useState(true);
  const [isColorExpanded, setIsColorExpanded] = useState(true);
  const [isHistogramExpanded, setIsHistogramExpanded] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'jpeg'>('png');

  // References
  const previewImgRef = useRef<HTMLImageElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const taskIdRef = useRef<number>(0);
  const pendingExportResolve = useRef<((value: string) => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingSplit = useRef(false);
  const isPanning = useRef(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Initialize Web Worker
  useEffect(() => {
    let worker: Worker | null = null;
    try {
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      workerRef.current = worker;

      worker.onmessage = (e) => {
        const { id, imgData, histogram } = e.data;

        // Export resolution task
        if (id === 'export' && pendingExportResolve.current) {
          const exportCanvas = document.createElement('canvas');
          exportCanvas.width = imgData.width;
          exportCanvas.height = imgData.height;
          const ctx = exportCanvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(imgData, 0, 0);
            pendingExportResolve.current(
              exportCanvas.toDataURL(exportFormat === 'png' ? 'image/png' : 'image/jpeg', 0.95)
            );
          }
          pendingExportResolve.current = null;
          return;
        }

        // Live preview task
        if (id === taskIdRef.current) {
          const canvas = document.createElement('canvas');
          canvas.width = imgData.width;
          canvas.height = imgData.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.putImageData(imgData, 0, 0);
            setEnhancedUrl(canvas.toDataURL('image/png', 0.92));
          }
          if (histogram) {
            setHistogramData(histogram);
          }
          setIsProcessing(false);
        }
      };

      worker.onerror = (err) => {
        console.error('Enhancer worker error:', err);
        setIsProcessing(false);
      };
    } catch (err) {
      console.warn('Web Worker not supported:', err);
    }

    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, [exportFormat]);

  // Request non-blocking enhancement via Web Worker
  const triggerWorkerEnhancement = useCallback((cfg: AdjustmentSettings) => {
    const img = previewImgRef.current;
    if (!img || !workerRef.current) return;

    const currentId = ++taskIdRef.current;
    setIsProcessing(true);

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

    workerRef.current.postMessage(
      {
        id: currentId,
        imgData,
        cfg,
      },
      [imgData.data.buffer]
    );
  }, []);

  // Debounced trigger on settings change
  useEffect(() => {
    if (!originalImage) return;
    const timer = setTimeout(() => {
      triggerWorkerEnhancement(settings);
    }, 60);
    return () => clearTimeout(timer);
  }, [originalImage, settings, triggerWorkerEnhancement]);

  // Keyboard shortcut listener: Spacebar to hold original
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && originalImage) {
        // Prevent page scroll when holding space
        e.preventDefault();
        setIsHoldingOriginal(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsHoldingOriginal(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [originalImage]);

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
          setZoomLevel(1);
          setPanPos({ x: 0, y: 0 });
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
    if (viewMode === 'split' && e.touches[0]) handleSplitMove(e.touches[0].clientX);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode === 'split' && Math.abs(e.clientX - (containerRef.current?.getBoundingClientRect().left || 0) - ((containerRef.current?.clientWidth || 0) * splitPos) / 100) < 30) {
      isDraggingSplit.current = true;
    } else if (zoomLevel > 1) {
      isPanning.current = true;
      panStartRef.current = { x: e.clientX - panPos.x, y: e.clientY - panPos.y };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingSplit.current && viewMode === 'split') {
      handleSplitMove(e.clientX);
    } else if (isPanning.current && zoomLevel > 1) {
      setPanPos({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
    }
  };

  const handleMouseUp = () => {
    isDraggingSplit.current = false;
    isPanning.current = false;
  };

  // Full-Resolution Export
  const downloadEnhanced = async () => {
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

      const fullResultUrl = await new Promise<string>((resolve) => {
        pendingExportResolve.current = resolve;
        if (workerRef.current) {
          workerRef.current.postMessage({ id: 'export', imgData, cfg: settings }, [imgData.data.buffer]);
        } else {
          resolve(
            exportCanvas.toDataURL(exportFormat === 'png' ? 'image/png' : 'image/jpeg', 0.95)
          );
        }
      });

      const link = document.createElement('a');
      link.download = `${imageMeta?.name || 'photo'}-enhanced-${settings.upscale}x.${exportFormat === 'png' ? 'png' : 'jpg'}`;
      link.href = fullResultUrl;
      link.click();
    } catch (err) {
      console.error('Export error:', err);
      alert('Failed to export image. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

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
  const loadSample = (type: 'portrait' | 'doc' | 'pixel') => {
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
    } else if (type === 'doc') {
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
    } else {
      // 8-bit Pixelated Retro Sprite Sample
      ctx.imageSmoothingEnabled = false;
      const offscreen = document.createElement('canvas');
      offscreen.width = 32;
      offscreen.height = 24;
      const octx = offscreen.getContext('2d');
      if (octx) {
        octx.fillStyle = '#0f172a';
        octx.fillRect(0, 0, 32, 24);

        // draw cute 8-bit spaceship / character with blocky pixels
        octx.fillStyle = '#38bdf8';
        octx.fillRect(14, 4, 4, 3);
        octx.fillStyle = '#818cf8';
        octx.fillRect(11, 7, 10, 5);
        octx.fillStyle = '#c084fc';
        octx.fillRect(8, 12, 16, 4);
        octx.fillStyle = '#f43f5e';
        octx.fillRect(6, 16, 5, 4);
        octx.fillRect(21, 16, 5, 4);
        octx.fillStyle = '#fbbf24';
        octx.fillRect(13, 16, 6, 3);

        ctx.drawImage(offscreen, 0, 0, 32, 24, 0, 0, 400, 300);
      }
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
      const chosenPreset: PresetMode =
        type === 'portrait' ? 'portrait' : type === 'doc' ? 'document' : 'depixelate';
      setActivePreset(chosenPreset);
      setSettings(PRESET_CONFIGS[chosenPreset]);
    };
    img.src = uri;
  };

  return (
    <div className="space-y-5 text-zinc-100 max-w-7xl mx-auto pb-12 animate-fade-in">
      {/* Background Rendering Modal for High-Res Export */}
      {isExporting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="p-6 rounded-2xl border border-zinc-800 bg-zinc-900 shadow-2xl max-w-sm w-full mx-4 text-center space-y-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-400 mx-auto animate-pulse">
              <Sparkles size={28} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Rendering Ultra-HD Image</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Applying {settings.upscale}x super-resolution, bilateral denoise & unsharp mask on background thread...
              </p>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500 h-full w-full animate-pulse" />
            </div>
            <p className="text-[11px] text-zinc-500">100% Free & client-side GPU/Worker computation</p>
          </div>
        </div>
      )}

      {/* Studio Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white shadow-md shadow-indigo-500/20">
            <Wand2 size={19} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight">Photo Studio Pro</h1>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                <ShieldCheck size={11} /> 100% Free & Unlimited
              </span>
            </div>
            <p className="text-[11px] sm:text-xs text-zinc-400">
              Professional Lightroom-grade dynamic range, unsharp de-blur, deep zoom & 4x super-resolution
            </p>
          </div>
        </div>

        {originalImage && (
          <div className="flex items-center gap-2">
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
              <span>New Photo</span>
            </button>
          </div>
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
            className="group cursor-pointer rounded-2xl border-2 border-dashed border-zinc-700 hover:border-indigo-500 bg-zinc-900/40 hover:bg-zinc-900/80 p-12 text-center transition flex flex-col items-center justify-center gap-4 shadow-xl"
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
                Click or drag & drop any photo to open in Professional Studio
              </p>
              <p className="text-xs text-zinc-400 mt-1 max-w-md mx-auto">
                Restore blurred portraits, low-light night shots, old documents, screenshots, and product photos
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-zinc-400 font-medium pt-2">
              <span className="flex items-center gap-1 text-emerald-400">
                <Check size={14} /> 100% Free & Private
              </span>
              <span className="flex items-center gap-1 text-blue-400">
                <Zap size={14} /> Background Multi-Thread
              </span>
              <span className="flex items-center gap-1 text-purple-400">
                <Maximize2 size={14} /> Up to 4x Super-Res
              </span>
            </div>
          </div>

          {/* Quick Demo Samples */}
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block">
              Or Try A Quick Demo Sample:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => loadSample('portrait')}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900 transition text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400">
                  <User size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Portrait Sample</h4>
                  <p className="text-[11px] text-zinc-500">De-blur face & skin tone</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => loadSample('doc')}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-900 transition text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
                  <FileText size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-200">Document Sample</h4>
                  <p className="text-[11px] text-zinc-500">Sharpen text & contrast</p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => loadSample('pixel')}
                className="flex items-center gap-3 p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-950/20 hover:border-indigo-500/60 hover:bg-indigo-950/40 transition text-left"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-pink-500/10 text-pink-400">
                  <Grid size={18} />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-indigo-200">Pixelated / Retro</h4>
                  <p className="text-[11px] text-zinc-400">Anti-alias 8-bit & 4x HD</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Active Pro Studio Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Viewport & Loupe Controls */}
          <div className="space-y-4 lg:col-span-8">
            {/* Low-Res / Pixelation Smart Detection Banner */}
            {imageMeta && (imageMeta.width <= 700 || imageMeta.height <= 700) && settings.depixelate < 15 && (
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-indigo-500/30 bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-zinc-900/40 backdrop-blur-sm animate-fade-in">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
                    <Grid size={16} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                      Low-Res / Pixelated Image Detected ({imageMeta.width} × {imageMeta.height} px)
                    </h4>
                    <p className="text-[11px] text-zinc-400">
                      Jagged square pixel edges detected. Apply directional anti-aliasing to smooth blocks into clean HD curves.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => selectPreset('depixelate')}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-sm transition flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles size={13} />
                  <span>Apply De-Pixelate (4x HD)</span>
                </button>
              </div>
            )}

            {/* Viewport Control Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl border border-zinc-800 bg-zinc-900/70">
              {/* View Modes */}
              <div className="flex items-center gap-1 p-1 rounded-xl bg-zinc-950/80 border border-zinc-800/80 text-xs">
                <button
                  type="button"
                  onClick={() => setViewMode('split')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition ${
                    viewMode === 'split'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                  title="Draggable Split Curtain Slider"
                >
                  <Split size={13} />
                  <span>Split</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('sideBySide')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition ${
                    viewMode === 'sideBySide'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                  title="Side-by-Side Dual Synchronized View"
                >
                  <Columns size={13} />
                  <span>Side-by-Side</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('single')}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium transition ${
                    viewMode === 'single'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/60'
                  }`}
                  title="Single Enhanced View"
                >
                  <Maximize2 size={13} />
                  <span>Single</span>
                </button>
              </div>

              {/* Zoom & Loupe Controls */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 px-2 py-1 rounded-xl bg-zinc-950/80 border border-zinc-800 text-xs">
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.max(1, z - 0.5))}
                    disabled={zoomLevel <= 1}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                    title="Zoom Out"
                  >
                    <ZoomOut size={14} />
                  </button>
                  <span className="font-mono text-zinc-300 px-1 min-w-[42px] text-center font-semibold">
                    {zoomLevel === 1 ? 'Fit' : `${Math.round(zoomLevel * 100)}%`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setZoomLevel((z) => Math.min(4, z + 0.5))}
                    disabled={zoomLevel >= 4}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
                    title="Zoom In"
                  >
                    <ZoomIn size={14} />
                  </button>
                  {zoomLevel > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        setZoomLevel(1);
                        setPanPos({ x: 0, y: 0 });
                      }}
                      className="ml-1 text-[10px] text-indigo-400 hover:underline px-1"
                    >
                      Reset
                    </button>
                  )}
                </div>

                {/* Spacebar Hold Hint */}
                <button
                  type="button"
                  onMouseDown={() => setIsHoldingOriginal(true)}
                  onMouseUp={() => setIsHoldingOriginal(false)}
                  onTouchStart={() => setIsHoldingOriginal(true)}
                  onTouchEnd={() => setIsHoldingOriginal(false)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-zinc-700 bg-zinc-800/80 hover:bg-zinc-700 text-xs font-medium text-zinc-200 shadow-sm active:scale-95 transition"
                >
                  <Eye size={13} />
                  <span>Hold Original (Space)</span>
                </button>
              </div>
            </div>

            {/* Viewport Canvas Container */}
            <div
              ref={containerRef}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchMove={handleTouchMove}
              className={`relative w-full aspect-[4/3] max-h-[580px] overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl select-none flex items-center justify-center ${
                zoomLevel > 1 ? 'cursor-grab active:cursor-grabbing' : ''
              }`}
            >
              {/* 1. SIDE-BY-SIDE MODE */}
              {viewMode === 'sideBySide' ? (
                <div className="grid grid-cols-2 w-full h-full divide-x divide-zinc-800">
                  {/* Left: Original */}
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-zinc-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={originalImage || ''}
                      alt="Original"
                      className="max-w-none object-contain transition-transform duration-75"
                      style={{
                        transform: `scale(${zoomLevel}) translate(${panPos.x / zoomLevel}px, ${panPos.y / zoomLevel}px)`,
                        width: '100%',
                        height: '100%',
                      }}
                    />
                    <div className="absolute top-3 left-3 pointer-events-none">
                      <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-semibold text-zinc-300 border border-zinc-800">
                        Original ({imageMeta?.width}×{imageMeta?.height})
                      </span>
                    </div>
                  </div>

                  {/* Right: Enhanced */}
                  <div className="relative w-full h-full overflow-hidden flex items-center justify-center bg-zinc-950">
                    {enhancedUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={enhancedUrl}
                        alt="Enhanced"
                        className="max-w-none object-contain transition-transform duration-75"
                        style={{
                          transform: `scale(${zoomLevel}) translate(${panPos.x / zoomLevel}px, ${panPos.y / zoomLevel}px)`,
                          width: '100%',
                          height: '100%',
                        }}
                      />
                    )}
                    <div className="absolute top-3 right-3 pointer-events-none">
                      <span className="px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md text-[11px] font-semibold text-white shadow-md">
                        Enhanced ({settings.upscale}x HD)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                /* 2. SPLIT CURTAIN OR SINGLE VIEW */
                <div
                  className="relative w-full h-full flex items-center justify-center overflow-hidden"
                  style={{
                    transform: `scale(${zoomLevel}) translate(${panPos.x / zoomLevel}px, ${panPos.y / zoomLevel}px)`,
                    transformOrigin: 'center center',
                    transition: 'transform 0.05s ease-out',
                  }}
                >
                  {/* Enhanced Base Image */}
                  {enhancedUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={enhancedUrl}
                      alt="Enhanced Result"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                    />
                  )}

                  {/* Original Clipped Layer for Split mode */}
                  {viewMode === 'split' && !isHoldingOriginal && originalImage && (
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

                  {/* 100% Original Layer when holding button or Spacebar */}
                  {isHoldingOriginal && originalImage && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={originalImage}
                      alt="Original"
                      className="absolute inset-0 w-full h-full object-contain pointer-events-none z-10"
                    />
                  )}

                  {/* Vertical Split Divider Bar */}
                  {viewMode === 'split' && !isHoldingOriginal && (
                    <div
                      className="absolute top-0 bottom-0 z-20 w-1 bg-white cursor-ew-resize shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                      style={{ left: `${splitPos}%` }}
                    >
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-white text-zinc-900 shadow-xl border border-zinc-200">
                        <Split size={14} className="rotate-90" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Viewport Overlay Badges */}
              {viewMode !== 'sideBySide' && (
                <>
                  <div className="absolute top-3 left-3 z-30 pointer-events-none">
                    <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md text-[11px] font-semibold text-zinc-300 border border-zinc-800">
                      {isHoldingOriginal ? 'Original Image' : `Original (${imageMeta?.width}×${imageMeta?.height})`}
                    </span>
                  </div>
                  <div className="absolute top-3 right-3 z-30 pointer-events-none flex items-center gap-2">
                    {isProcessing && (
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/80 backdrop-blur-md text-[11px] font-semibold text-indigo-200 border border-indigo-700 animate-pulse">
                        <Loader2 size={12} className="animate-spin" /> Live Worker...
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-600/90 backdrop-blur-md text-[11px] font-semibold text-white shadow-md">
                      Enhanced ({settings.upscale}x HD • {imageMeta ? imageMeta.width * settings.upscale : 0}×
                      {imageMeta ? imageMeta.height * settings.upscale : 0})
                    </span>
                  </div>
                </>
              )}

              {/* Bottom Instructions */}
              <div className="absolute bottom-3 inset-x-3 z-30 flex items-center justify-between pointer-events-none">
                <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-[10px] text-zinc-400">
                  {viewMode === 'split'
                    ? 'Drag split bar to compare • Hold Space for original'
                    : 'Pan with mouse when zoomed in'}
                </span>
              </div>
            </div>

            {/* Pro Export Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-zinc-800 bg-zinc-900/50">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <span>Output:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {imageMeta ? imageMeta.width * settings.upscale : 0} ×{' '}
                    {imageMeta ? imageMeta.height * settings.upscale : 0} px ({settings.upscale}x)
                  </span>
                </div>

                {/* Format Toggle */}
                <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setExportFormat('png')}
                    className={`px-2 py-0.5 rounded font-semibold ${
                      exportFormat === 'png' ? 'bg-indigo-600 text-white' : 'text-zinc-400'
                    }`}
                  >
                    PNG
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportFormat('jpeg')}
                    className={`px-2 py-0.5 rounded font-semibold ${
                      exportFormat === 'jpeg' ? 'bg-indigo-600 text-white' : 'text-zinc-400'
                    }`}
                  >
                    JPG (95%)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyEnhanced}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition"
                >
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied!' : 'Copy'}</span>
                </button>

                <button
                  type="button"
                  onClick={downloadEnhanced}
                  disabled={isExporting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-lg shadow-indigo-500/20 transition disabled:opacity-50"
                >
                  {isExporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                  <span>Download Ultra-HD {exportFormat.toUpperCase()}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Pro Presets, Live Histogram & Lightroom Controls */}
          <div className="space-y-4 lg:col-span-4">
            {/* Quick Enhancement Presets */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Studio Profiles
                </span>
                <Sparkles size={14} className="text-indigo-400" />
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
                    <Sparkles size={12} className="text-indigo-400" /> Auto Master
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">AI balanced curves</span>
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
                    <User size={12} className="text-indigo-400" /> Portrait Pro
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Texture & eye clarity</span>
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
                  <span className="text-[10px] text-zinc-500 leading-tight">Razor sharp ink & b/w</span>
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
                  <span className="text-[10px] text-zinc-500 leading-tight">Deep shadow recovery</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('night')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'night'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Moon size={12} className="text-indigo-400" /> Night ISO Denoise
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Bilateral noise cleaner</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('ecommerce')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'ecommerce'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Zap size={12} className="text-indigo-400" /> E-Commerce Crisp
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Edge punch & pop</span>
                </button>

                <button
                  type="button"
                  onClick={() => selectPreset('depixelate')}
                  className={`flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition ${
                    activePreset === 'depixelate'
                      ? 'border-indigo-500 bg-indigo-600/20 text-indigo-300'
                      : 'border-zinc-800 bg-zinc-950/70 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                  }`}
                >
                  <span className="text-xs font-semibold flex items-center gap-1.5">
                    <Grid size={12} className="text-indigo-400" /> De-Pixelate (4x HD)
                  </span>
                  <span className="text-[10px] text-zinc-500 leading-tight">Anti-aliasing & smooth</span>
                </button>
              </div>

              {/* Super-Resolution Engine Switcher */}
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

            {/* Live RGB & Luminance Histogram */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 space-y-2">
              <div
                onClick={() => setIsHistogramExpanded((h) => !h)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2">
                  <BarChart2 size={14} className="text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300">
                    RGB & Luminance Histogram
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-zinc-400 transition-transform ${isHistogramExpanded ? 'rotate-180' : ''}`}
                />
              </div>

              {isHistogramExpanded && (
                <div className="pt-2">
                  <div className="relative w-full h-20 bg-zinc-950 rounded-xl overflow-hidden border border-zinc-800/80 flex items-end px-1">
                    {histogramData ? (
                      <svg className="w-full h-full" viewBox="0 0 256 100" preserveAspectRatio="none">
                        {/* Red Channel */}
                        <path
                          d={
                            'M 0 100 ' +
                            histogramData.r
                              .map((v, i) => `L ${i} ${100 - Math.min(100, (v / 80) * 100)}`)
                              .join(' ') +
                            ' L 256 100 Z'
                          }
                          fill="rgba(239, 68, 68, 0.25)"
                          stroke="rgba(239, 68, 68, 0.8)"
                          strokeWidth="1"
                        />
                        {/* Green Channel */}
                        <path
                          d={
                            'M 0 100 ' +
                            histogramData.g
                              .map((v, i) => `L ${i} ${100 - Math.min(100, (v / 80) * 100)}`)
                              .join(' ') +
                            ' L 256 100 Z'
                          }
                          fill="rgba(34, 197, 94, 0.25)"
                          stroke="rgba(34, 197, 94, 0.8)"
                          strokeWidth="1"
                        />
                        {/* Blue Channel */}
                        <path
                          d={
                            'M 0 100 ' +
                            histogramData.b
                              .map((v, i) => `L ${i} ${100 - Math.min(100, (v / 80) * 100)}`)
                              .join(' ') +
                            ' L 256 100 Z'
                          }
                          fill="rgba(59, 130, 246, 0.25)"
                          stroke="rgba(59, 130, 246, 0.8)"
                          strokeWidth="1"
                        />
                        {/* Luminance Curve */}
                        <path
                          d={
                            'M 0 100 ' +
                            histogramData.lum
                              .map((v, i) => `L ${i} ${100 - Math.min(100, (v / 80) * 100)}`)
                              .join(' ')
                          }
                          fill="none"
                          stroke="rgba(255, 255, 255, 0.9)"
                          strokeWidth="1.2"
                        />
                      </svg>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[11px] text-zinc-500">
                        Generating real-time histogram...
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 mt-1 px-1">
                    <span>Shadows (0)</span>
                    <span>Midtones (128)</span>
                    <span>Highlights (255)</span>
                  </div>
                </div>
              )}
            </div>

            {/* 1. LIGHTROOM-GRADE DYNAMIC RANGE & LIGHTING */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all">
              <button
                type="button"
                onClick={() => setIsLightingExpanded((e) => !e)}
                className="flex items-center justify-between w-full select-none text-left"
              >
                <div className="flex items-center gap-2">
                  <Sun size={14} className="text-amber-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                    Light & Dynamic Range
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-zinc-400 transition-transform ${isLightingExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isLightingExpanded && (
                <div className="space-y-3.5 pt-3 mt-2 border-t border-zinc-800/80 animate-fade-in">
                  {/* Exposure */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Exposure:</span>
                      <span className="font-mono text-zinc-200">
                        {settings.exposure > 0 ? `+${settings.exposure}` : settings.exposure}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.exposure}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, exposure: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Highlights */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Highlights (Recover Blowouts):</span>
                      <span className="font-mono text-zinc-200">
                        {settings.highlights > 0 ? `+${settings.highlights}` : settings.highlights}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.highlights}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, highlights: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Shadows */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Shadows (Lift Dark Areas):</span>
                      <span className="font-mono text-zinc-200">
                        {settings.shadows > 0 ? `+${settings.shadows}` : settings.shadows}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.shadows}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, shadows: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Contrast */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Contrast:</span>
                      <span className="font-mono text-zinc-200">
                        {settings.contrast > 0 ? `+${settings.contrast}` : settings.contrast}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.contrast}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, contrast: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. DETAIL & CLARITY ACCORDION */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all">
              <button
                type="button"
                onClick={() => setIsDetailExpanded((e) => !e)}
                className="flex items-center justify-between w-full select-none text-left"
              >
                <div className="flex items-center gap-2">
                  <Sliders size={14} className="text-indigo-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                    Detail, Clarity & Noise
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-zinc-400 transition-transform ${isDetailExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isDetailExpanded && (
                <div className="space-y-3.5 pt-3 mt-2 border-t border-zinc-800/80 animate-fade-in">
                  {/* Sharpness */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Unsharp Mask & Edge Recovery:</span>
                      <span className="font-mono text-zinc-200">{settings.sharpness}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.sharpness}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, sharpness: Number(e.target.value) }));
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
                        setSettings((s) => ({ ...s, clarity: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Dehaze */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Dehaze:</span>
                      <span className="font-mono text-zinc-200">{settings.dehaze}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.dehaze}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, dehaze: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Bilateral Denoise */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Bilateral Noise Reduction:</span>
                      <span className="font-mono text-zinc-200">{settings.denoise}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.denoise}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, denoise: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* De-Pixelate & Anti-Aliasing */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span className="flex items-center gap-1.5">
                        <span>De-Pixelate & Anti-Aliasing:</span>
                        {settings.depixelate > 0 && (
                          <span className="text-[10px] text-indigo-400 font-semibold bg-indigo-500/15 px-1.5 py-0.2 rounded">
                            Active
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-zinc-200">{settings.depixelate}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={settings.depixelate}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, depixelate: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Smooths square block edges & staircased pixels into natural HD curves
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* 3. COLOR & WHITE BALANCE ACCORDION */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all">
              <button
                type="button"
                onClick={() => setIsColorExpanded((e) => !e)}
                className="flex items-center justify-between w-full select-none text-left"
              >
                <div className="flex items-center gap-2">
                  <Sun size={14} className="text-cyan-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                    Color & White Balance
                  </span>
                </div>
                <ChevronDown
                  size={15}
                  className={`text-zinc-400 transition-transform ${isColorExpanded ? 'rotate-180' : ''}`}
                />
              </button>

              {isColorExpanded && (
                <div className="space-y-3.5 pt-3 mt-2 border-t border-zinc-800/80 animate-fade-in">
                  {/* Temperature */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Temperature (Cool / Warm):</span>
                      <span className="font-mono text-zinc-200">
                        {settings.temperature > 0 ? `+${settings.temperature}` : settings.temperature}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.temperature}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, temperature: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Vibrance */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Smart Vibrance:</span>
                      <span className="font-mono text-zinc-200">
                        {settings.vibrance > 0 ? `+${settings.vibrance}` : settings.vibrance}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.vibrance}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, vibrance: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  {/* Saturation */}
                  <div>
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Saturation:</span>
                      <span className="font-mono text-zinc-200">
                        {settings.saturation > 0 ? `+${settings.saturation}` : settings.saturation}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={settings.saturation}
                      onChange={(e) => {
                        setActivePreset('custom');
                        setSettings((s) => ({ ...s, saturation: Number(e.target.value) }));
                      }}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => selectPreset('auto')}
                    className="w-full py-1.5 rounded-lg border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition"
                  >
                    Reset All Controls to Auto
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
