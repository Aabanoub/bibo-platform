'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import { createClient } from '@/lib/supabase';
import {
  QrCode,
  Link as LinkIcon,
  Type,
  Wifi,
  User,
  Mail,
  Phone,
  MessageCircle,
  Coins,
  Download,
  Copy,
  Check,
  Sparkles,
  Sliders,
  Share2,
  RefreshCw,
  ExternalLink,
  Save,
  Image as ImageIcon,
  Upload,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  Circle,
  Square,
  ChevronDown,
} from 'lucide-react';

type QRType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'phone' | 'whatsapp' | 'crypto';

interface ColorPreset {
  name: string;
  fg: string;
  bg: string;
}

interface PresetLogo {
  name: string;
  icon: string;
  dataUri: string;
}

const PRESET_LOGOS: PresetLogo[] = [
  {
    name: 'WhatsApp',
    icon: '💬',
    dataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%2325D366"/><path fill="%23ffffff" d="M34.8 13.2C32 10.4 28.2 8.8 24.2 8.8c-8.5 0-15.4 6.9-15.4 15.4 0 2.7.7 5.4 2.1 7.7L9 40l8.3-2.2c2.2 1.2 4.7 1.9 7.1 1.9 8.5 0 15.4-6.9 15.4-15.4 0-4.1-1.6-7.9-4.5-10.7z"/></svg>',
  },
  {
    name: 'Website',
    icon: '🌐',
    dataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%232563EB"/><circle cx="24" cy="24" r="16" fill="none" stroke="%23ffffff" stroke-width="2.5"/><ellipse cx="24" cy="24" rx="8" ry="16" fill="none" stroke="%23ffffff" stroke-width="2.5"/><line x1="8" y1="24" x2="40" y2="24" stroke="%23ffffff" stroke-width="2.5"/></svg>',
  },
  {
    name: 'Wi-Fi',
    icon: '📶',
    dataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%23059669"/><path fill="%23ffffff" d="M24 33a3 3 0 100 6 3 3 0 000-6zm-7.8-5.7a11 11 0 0115.6 0l-2.1 2.1a8 8 0 00-11.4 0l-2.1-2.1zm-4.2-4.2a17 17 0 0124 0l-2.1 2.1a14 14 0 00-19.8 0l-2.1-2.1z"/></svg>',
  },
  {
    name: 'Bitcoin',
    icon: '₿',
    dataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%23F59E0B"/><text x="50%" y="54%" font-family="Arial,sans-serif" font-weight="bold" font-size="24" fill="%23ffffff" text-anchor="middle" dominant-baseline="middle">₿</text></svg>',
  },
  {
    name: 'User',
    icon: '👤',
    dataUri:
      'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><circle cx="24" cy="24" r="24" fill="%236366F1"/><circle cx="24" cy="18" r="8" fill="%23ffffff"/><path fill="%23ffffff" d="M10 38c0-7.7 6.3-14 14-14s14 6.3 14 14z"/></svg>',
  },
];

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, radius);
  } else {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y + radius, x, y);
    ctx.closePath();
  }
}

const COLOR_PRESETS: ColorPreset[] = [
  { name: 'Classic Black', fg: '#000000', bg: '#ffffff' },
  { name: 'Dark Mode', fg: '#ffffff', bg: '#09090b' },
  { name: 'Electric Blue', fg: '#2563eb', bg: '#ffffff' },
  { name: 'Emerald Mint', fg: '#059669', bg: '#ffffff' },
  { name: 'Cyber Purple', fg: '#7c3aed', bg: '#ffffff' },
  { name: 'Neon Amber', fg: '#d97706', bg: '#18181b' },
  { name: 'Ruby Crimson', fg: '#e11d48', bg: '#ffffff' },
];

export default function QrGeneratorPage() {
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // QR Content Type
  const [activeType, setActiveType] = useState<QRType>('url');

  // Input states for each type
  const [urlInput, setUrlInput] = useState('https://');
  const [textInput, setTextInput] = useState('');

  // Wi-Fi inputs
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [wifiEncryption, setWifiEncryption] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [wifiHidden, setWifiHidden] = useState(false);

  // vCard inputs
  const [vcardFirst, setVcardFirst] = useState('');
  const [vcardLast, setVcardLast] = useState('');
  const [vcardPhone, setVcardPhone] = useState('');
  const [vcardEmail, setVcardEmail] = useState('');
  const [vcardCompany, setVcardCompany] = useState('');
  const [vcardTitle, setVcardTitle] = useState('');
  const [vcardUrl, setVcardUrl] = useState('');

  // Email inputs
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  // Phone input
  const [phoneInput, setPhoneInput] = useState('');

  // WhatsApp inputs
  const [waPhone, setWaPhone] = useState('');
  const [waMessage, setWaMessage] = useState('');

  // Crypto inputs
  const [cryptoCoin, setCryptoCoin] = useState('bitcoin');
  const [cryptoAddress, setCryptoAddress] = useState('');
  const [cryptoAmount, setCryptoAmount] = useState('');

  // Style states
  const [fgColor, setFgColor] = useState('#000000');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [errorLevel, setErrorLevel] = useState<'L' | 'M' | 'Q' | 'H'>('M');
  const [qrSize, setQrSize] = useState(300);
  const [margin, setMargin] = useState(2);

  // Feedback states
  const [copied, setCopied] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  // Center Photo / Logo states
  const [logoImage, setLogoImage] = useState<string | null>(null);
  const [isLogoSectionExpanded, setIsLogoSectionExpanded] = useState<boolean>(false);
  const [logoSizePercent, setLogoSizePercent] = useState<number>(20);
  const [logoShape, setLogoShape] = useState<'circle' | 'square'>('circle');
  const [logoPadding, setLogoPadding] = useState<number>(4);
  const [logoBgColor, setLogoBgColor] = useState<string>('#ffffff');
  const [logoBorderWidth, setLogoBorderWidth] = useState<number>(2);
  const [logoBorderColor, setLogoBorderColor] = useState<string>('#e4e4e7');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file (PNG, JPG, SVG, WebP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        setLogoImage(result);
        setErrorLevel('H');
        setIsLogoSectionExpanded(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (result) {
          setLogoImage(result);
          setErrorLevel('H');
          setIsLogoSectionExpanded(true);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeLogo = () => {
    setLogoImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Compute the formatted raw payload for the QR code
  const rawQrValue = useMemo(() => {
    switch (activeType) {
      case 'url':
        return urlInput.trim() || 'https://';

      case 'text':
        return textInput.trim() || 'Hello World';

      case 'wifi': {
        const ssid = wifiSsid.trim();
        const pwd = wifiPassword.trim();
        const enc = wifiEncryption;
        const hidden = wifiHidden ? 'H:true;' : '';
        // Standard WIFI format: WIFI:T:WPA;S:MyNetwork;P:password;H:false;;
        return `WIFI:T:${enc};S:${ssid};P:${pwd};${hidden};`;
      }

      case 'vcard': {
        const lines = [
          'BEGIN:VCARD',
          'VERSION:3.0',
          `N:${vcardLast.trim()};${vcardFirst.trim()};;;`,
          `FN:${vcardFirst.trim()} ${vcardLast.trim()}`.trim(),
        ];
        if (vcardCompany.trim()) lines.push(`ORG:${vcardCompany.trim()}`);
        if (vcardTitle.trim()) lines.push(`TITLE:${vcardTitle.trim()}`);
        if (vcardPhone.trim()) lines.push(`TEL;TYPE=CELL:${vcardPhone.trim()}`);
        if (vcardEmail.trim()) lines.push(`EMAIL:${vcardEmail.trim()}`);
        if (vcardUrl.trim()) lines.push(`URL:${vcardUrl.trim()}`);
        lines.push('END:VCARD');
        return lines.join('\n');
      }

      case 'email': {
        const to = emailTo.trim();
        const params = new URLSearchParams();
        if (emailSubject.trim()) params.append('subject', emailSubject.trim());
        if (emailBody.trim()) params.append('body', emailBody.trim());
        const query = params.toString();
        return `mailto:${to}${query ? `?${query}` : ''}`;
      }

      case 'phone':
        return `tel:${phoneInput.trim()}`;

      case 'whatsapp': {
        const cleanPhone = waPhone.replace(/\D/g, '');
        const msg = encodeURIComponent(waMessage.trim());
        return `https://wa.me/${cleanPhone}${msg ? `?text=${msg}` : ''}`;
      }

      case 'crypto': {
        const coin = cryptoCoin.toLowerCase();
        const addr = cryptoAddress.trim();
        const amt = cryptoAmount.trim();
        return `${coin}:${addr}${amt ? `?amount=${amt}` : ''}`;
      }

      default:
        return 'https://';
    }
  }, [
    activeType,
    urlInput,
    textInput,
    wifiSsid,
    wifiPassword,
    wifiEncryption,
    wifiHidden,
    vcardFirst,
    vcardLast,
    vcardPhone,
    vcardEmail,
    vcardCompany,
    vcardTitle,
    vcardUrl,
    emailTo,
    emailSubject,
    emailBody,
    phoneInput,
    waPhone,
    waMessage,
    cryptoCoin,
    cryptoAddress,
    cryptoAmount,
  ]);

  // Render QR Code to Canvas whenever inputs or styles change
  useEffect(() => {
    if (!canvasRef.current) return;
    let isCancelled = false;

    // Enforce high error correction level ('H') when a center photo is present so the QR remains 100% scannable
    const effectiveErrorLevel = logoImage ? 'H' : errorLevel;

    QRCode.toCanvas(
      canvasRef.current,
      rawQrValue,
      {
        width: qrSize,
        margin,
        color: {
          dark: fgColor,
          light: bgColor,
        },
        errorCorrectionLevel: effectiveErrorLevel,
      },
      (err) => {
        if (err || isCancelled || !canvasRef.current) {
          if (err) console.error('QR code generation error:', err);
          return;
        }

        if (!logoImage) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          if (isCancelled || !canvasRef.current) return;

          const width = canvas.width;
          const height = canvas.height;
          const size = Math.round((width * logoSizePercent) / 100);
          const x = Math.round((width - size) / 2);
          const y = Math.round((height - size) / 2);
          const padding = logoPadding;
          const bgSize = size + padding * 2;
          const bgX = Math.round((width - bgSize) / 2);
          const bgY = Math.round((height - bgSize) / 2);

          ctx.save();

          // Draw background badge for logo
          ctx.fillStyle = logoBgColor;
          if (logoShape === 'circle') {
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, bgSize / 2, 0, Math.PI * 2);
            ctx.fill();

            if (logoBorderWidth > 0) {
              ctx.strokeStyle = logoBorderColor;
              ctx.lineWidth = logoBorderWidth;
              ctx.stroke();
            }

            // Clip & draw image
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, size / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
          } else {
            const radius = Math.max(4, Math.round(size * 0.2));
            const bgRadius = radius + padding;

            drawRoundedRect(ctx, bgX, bgY, bgSize, bgSize, bgRadius);
            ctx.fill();

            if (logoBorderWidth > 0) {
              ctx.strokeStyle = logoBorderColor;
              ctx.lineWidth = logoBorderWidth;
              ctx.stroke();
            }

            drawRoundedRect(ctx, x, y, size, size, radius);
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
          }

          ctx.restore();
        };

        img.onerror = (e) => {
          console.error('Failed to load center logo image:', e);
        };

        img.src = logoImage;
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [
    rawQrValue,
    fgColor,
    bgColor,
    errorLevel,
    qrSize,
    margin,
    logoImage,
    logoSizePercent,
    logoShape,
    logoPadding,
    logoBgColor,
    logoBorderWidth,
    logoBorderColor,
  ]);

  // Download PNG
  const downloadPng = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `qrcode-${activeType}-${Date.now()}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Download SVG
  const downloadSvg = async () => {
    try {
      const effectiveErrorLevel = logoImage ? 'H' : errorLevel;
      let svgString = await QRCode.toString(rawQrValue, {
        type: 'svg',
        width: qrSize,
        margin,
        color: {
          dark: fgColor,
          light: bgColor,
        },
        errorCorrectionLevel: effectiveErrorLevel,
      });

      if (logoImage) {
        const size = Math.round((qrSize * logoSizePercent) / 100);
        const x = Math.round((qrSize - size) / 2);
        const y = Math.round((qrSize - size) / 2);
        const padding = logoPadding;
        const bgSize = size + padding * 2;
        const bgX = Math.round((qrSize - bgSize) / 2);
        const bgY = Math.round((qrSize - bgSize) / 2);
        const fill = logoBgColor;

        let logoSvgChunk = '';
        if (logoShape === 'circle') {
          const cx = qrSize / 2;
          const cy = qrSize / 2;
          const r = bgSize / 2;
          const imgR = size / 2;
          const borderAttr =
            logoBorderWidth > 0
              ? `stroke="${logoBorderColor}" stroke-width="${logoBorderWidth}"`
              : '';
          logoSvgChunk = `
            <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" ${borderAttr} />
            <defs>
              <clipPath id="center-logo-clip">
                <circle cx="${cx}" cy="${cy}" r="${imgR}" />
              </clipPath>
            </defs>
            <image href="${logoImage}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#center-logo-clip)" preserveAspectRatio="xMidYMid slice" />
          `;
        } else {
          const radius = Math.min(12, size * 0.2);
          const bgRadius = radius + padding;
          const borderAttr =
            logoBorderWidth > 0
              ? `stroke="${logoBorderColor}" stroke-width="${logoBorderWidth}"`
              : '';
          logoSvgChunk = `
            <rect x="${bgX}" y="${bgY}" width="${bgSize}" height="${bgSize}" rx="${bgRadius}" fill="${fill}" ${borderAttr} />
            <defs>
              <clipPath id="center-logo-clip">
                <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${radius}" />
              </clipPath>
            </defs>
            <image href="${logoImage}" x="${x}" y="${y}" width="${size}" height="${size}" clip-path="url(#center-logo-clip)" preserveAspectRatio="xMidYMid slice" />
          `;
        }
        svgString = svgString.replace('</svg>', `${logoSvgChunk}</svg>`);
      }

      const blob = new Blob([svgString], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `qrcode-${activeType}-${Date.now()}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error generating SVG:', err);
    }
  };

  // Copy Image to Clipboard
  const copyImage = async () => {
    if (!canvasRef.current) return;
    try {
      canvasRef.current.toBlob(async (blob) => {
        if (!blob) return;
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob }),
          ]);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Fallback: copy raw text payload
          await navigator.clipboard.writeText(rawQrValue);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }
      });
    } catch (err) {
      console.error('Could not copy image:', err);
    }
  };

  // Save QR Code link/info to user's Notes
  const saveToNotes = async () => {
    setSavingNote(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert('Please log in to save notes.');
        return;
      }

      await supabase.from('profiles').upsert(
        {
          id: user.id,
          full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'User',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      );

      const noteTitle = `QR Code: ${activeType.toUpperCase()}`;
      const noteContent = `### QR Code Information\n- **Type:** ${activeType}\n- **Data / Payload:** \`${rawQrValue}\`\n- **Center Photo:** ${logoImage ? 'Yes' : 'No'}\n- **Generated At:** ${new Date().toLocaleString()}\n\nScan this code from your screen or download the image.`;

      await supabase.from('notes').insert({
        user_id: user.id,
        title: noteTitle,
        content: noteContent,
        tags: ['qrcode', activeType],
        is_pinned: false,
      });

      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2500);
    } catch (err: any) {
      console.error('Failed to save note:', err);
      alert('Could not save note: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const TYPES: { id: QRType; label: string; icon: any }[] = [
    { id: 'url', label: 'Website URL', icon: LinkIcon },
    { id: 'text', label: 'Plain Text', icon: Type },
    { id: 'wifi', label: 'Wi-Fi Network', icon: Wifi },
    { id: 'vcard', label: 'Contact Card', icon: User },
    { id: 'email', label: 'Email Message', icon: Mail },
    { id: 'phone', label: 'Phone Call', icon: Phone },
    { id: 'whatsapp', label: 'WhatsApp Chat', icon: MessageCircle },
    { id: 'crypto', label: 'Crypto Address', icon: Coins },
  ];

  return (
    <div className="text-zinc-100">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-4 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <QrCode size={18} />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-bold tracking-tight">QR Code Studio</h1>
            <p className="text-[11px] sm:text-xs text-zinc-400">Generate custom QR codes for anything</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveToNotes}
            disabled={savingNote}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white transition active:scale-95"
            title="Save payload to Notes"
          >
            {noteSaved ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Save size={14} />
            )}
            <span>
              {noteSaved ? 'Saved to Notes!' : 'Save to Notes'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="p-0 sm:p-2">
        <div className="mx-auto max-w-6xl grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Generator Inputs & Customization */}
          <div className="space-y-6 lg:col-span-7">
            {/* Content Type Selector Pills */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2 px-1">
                Choose Content Type
              </span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => {
                  const Icon = t.icon;
                  const isActive = activeType === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setActiveType(t.id)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-xs font-medium transition ${
                        isActive
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20 font-semibold'
                          : 'border border-zinc-800 bg-zinc-950/60 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                      }`}
                    >
                      <Icon size={15} />
                      <span className="truncate">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dynamic Content Inputs */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                Content Details
              </span>

              {/* URL */}
              {activeType === 'url' && (
                <div>
                  <label className="text-xs text-zinc-300 block mb-1">Website URL:</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    When scanned, opens the browser directly to this webpage.
                  </p>
                </div>
              )}

              {/* Text */}
              {activeType === 'text' && (
                <div>
                  <label className="text-xs text-zinc-300 block mb-1">Text / Message:</label>
                  <textarea
                    rows={4}
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    placeholder="Type or paste any note, message, secret key, or instructions…"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Wi-Fi */}
              {activeType === 'wifi' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">Network Name (SSID):</label>
                    <input
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="e.g. MyHomeNetwork_5G"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Password:</label>
                      <input
                        type="text"
                        value={wifiPassword}
                        onChange={(e) => setWifiPassword(e.target.value)}
                        placeholder="Network password"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Security Type:</label>
                      <select
                        value={wifiEncryption}
                        onChange={(e) => setWifiEncryption(e.target.value as any)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      >
                        <option value="WPA">WPA / WPA2 / WPA3 (Standard)</option>
                        <option value="WEP">WEP (Older)</option>
                        <option value="nopass">None (Open Network)</option>
                      </select>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={wifiHidden}
                      onChange={(e) => setWifiHidden(e.target.checked)}
                      className="rounded border-zinc-700 bg-zinc-950 text-blue-600 focus:ring-0"
                    />
                    <span>Hidden network (SSID is not broadcasted)</span>
                  </label>
                  <p className="text-[11px] text-zinc-500">
                    Scanning this instantly prompts guests on iPhone and Android to join your Wi-Fi!
                  </p>
                </div>
              )}

              {/* vCard */}
              {activeType === 'vcard' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">First Name:</label>
                      <input
                        type="text"
                        value={vcardFirst}
                        onChange={(e) => setVcardFirst(e.target.value)}
                        placeholder="Abanoub"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Last Name:</label>
                      <input
                        type="text"
                        value={vcardLast}
                        onChange={(e) => setVcardLast(e.target.value)}
                        placeholder="Emad"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Phone Number:</label>
                      <input
                        type="tel"
                        value={vcardPhone}
                        onChange={(e) => setVcardPhone(e.target.value)}
                        placeholder="+1 234 567 8900"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Email Address:</label>
                      <input
                        type="email"
                        value={vcardEmail}
                        onChange={(e) => setVcardEmail(e.target.value)}
                        placeholder="hello@example.com"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Company:</label>
                      <input
                        type="text"
                        value={vcardCompany}
                        onChange={(e) => setVcardCompany(e.target.value)}
                        placeholder="Company name"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Website URL:</label>
                      <input
                        type="url"
                        value={vcardUrl}
                        onChange={(e) => setVcardUrl(e.target.value)}
                        placeholder="https://mywebsite.com"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Email */}
              {activeType === 'email' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">Recipient Email:</label>
                    <input
                      type="email"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      placeholder="support@example.com"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">Subject:</label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      placeholder="Inquiry / Meeting Request"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">Body Text:</label>
                    <textarea
                      rows={3}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      placeholder="Pre-filled message text…"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Phone */}
              {activeType === 'phone' && (
                <div>
                  <label className="text-xs text-zinc-300 block mb-1">Phone Number:</label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="+1 (555) 000-1234"
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-sm text-zinc-100 outline-none focus:border-blue-500"
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Scanning automatically dials this phone number.
                  </p>
                </div>
              )}

              {/* WhatsApp */}
              {activeType === 'whatsapp' && (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">
                      Phone Number (with Country Code):
                    </label>
                    <input
                      type="tel"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="e.g. 201234567890 or 15551234567"
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">
                      Pre-filled Message:
                    </label>
                    <textarea
                      rows={3}
                      value={waMessage}
                      onChange={(e) => setWaMessage(e.target.value)}
                      placeholder="Hello! I would like to learn more about your services."
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}

              {/* Crypto */}
              {activeType === 'crypto' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Coin:</label>
                      <select
                        value={cryptoCoin}
                        onChange={(e) => setCryptoCoin(e.target.value)}
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      >
                        <option value="bitcoin">Bitcoin (BTC)</option>
                        <option value="ethereum">Ethereum (ETH)</option>
                        <option value="solana">Solana (SOL)</option>
                        <option value="usdt">Tether (USDT)</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-zinc-300 block mb-1">Amount (Optional):</label>
                      <input
                        type="text"
                        value={cryptoAmount}
                        onChange={(e) => setCryptoAmount(e.target.value)}
                        placeholder="0.05"
                        className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-zinc-300 block mb-1">Wallet Address:</label>
                    <input
                      type="text"
                      value={cryptoAddress}
                      onChange={(e) => setCryptoAddress(e.target.value)}
                      placeholder="e.g. 0x123... or bc1q..."
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2 text-xs font-mono text-zinc-100 outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Center Photo / Logo Badge Card (Collapsed by default until expanded) */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4 transition-all">
              <div
                onClick={() => setIsLogoSectionExpanded((prev) => !prev)}
                className="flex items-center justify-between cursor-pointer select-none"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                    <ImageIcon size={15} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-200">
                        Center Photo / Logo
                      </span>
                      {logoImage ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-medium">
                          <CheckCircle2 size={10} /> Active
                        </span>
                      ) : (
                        <span className="text-[10px] text-zinc-500">Optional</span>
                      )}
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      {logoImage
                        ? 'Photo embedded in QR center (Click to edit)'
                        : 'Add brand logo or custom image in the middle'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {logoImage && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLogo();
                      }}
                      className="flex items-center gap-1 rounded-lg border border-red-900/40 bg-red-950/40 px-2 py-1 text-[11px] font-medium text-red-400 hover:bg-red-900/50 hover:text-red-300 transition"
                    >
                      <Trash2 size={11} />
                      <span>Remove</span>
                    </button>
                  )}
                  <div className="flex items-center gap-1 text-xs text-zinc-400 group-hover:text-zinc-200">
                    <span className="text-[11px] hidden sm:inline text-zinc-400">
                      {isLogoSectionExpanded ? 'Hide' : 'Expand'}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-zinc-400 transition-transform duration-200 ${
                        isLogoSectionExpanded ? 'rotate-180 text-blue-400' : ''
                      }`}
                    />
                  </div>
                </div>
              </div>

              {isLogoSectionExpanded && (
                <div className="space-y-4 pt-4 mt-3 border-t border-zinc-800/80 animate-fade-in">
                  <p className="text-xs text-zinc-400">
                    Add a custom photo, logo, or icon in the center of the QR code. Error correction automatically adjusts to High (30% redundancy) to guarantee camera readability.
                  </p>

                  {/* Upload Area / Dropzone */}
                  {!logoImage ? (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className="group cursor-pointer rounded-xl border border-dashed border-zinc-700 hover:border-blue-500 bg-zinc-950/60 hover:bg-zinc-950 p-4 text-center transition flex flex-col items-center justify-center gap-2"
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 group-hover:bg-blue-600/20 text-zinc-400 group-hover:text-blue-400 transition">
                        <Upload size={18} />
                      </div>
                      <div>
                        <p className="text-xs font-medium text-zinc-200">
                          Click or drag & drop to upload a photo
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-0.5">PNG, JPG, SVG, or WebP</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 p-3 rounded-xl border border-zinc-800 bg-zinc-950/80">
                      <div
                        className="relative flex items-center justify-center h-14 w-14 rounded-xl border border-zinc-700/60 overflow-hidden flex-shrink-0"
                        style={{ backgroundColor: logoBgColor }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={logoImage}
                          alt="Center Logo Preview"
                          className="h-10 w-10 object-contain rounded-md"
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                          <ShieldCheck size={14} />
                          <span>Active & Scannable</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          High error correction (30%) enforced so phone cameras scan instantly.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-xs text-blue-400 hover:text-blue-300 underline font-medium px-2 py-1"
                      >
                        Change
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                      </button>
                    </div>
                  )}

                  {/* Quick Preset Icons */}
                  <div>
                    <span className="text-[11px] font-medium text-zinc-400 block mb-2">Or pick a quick icon:</span>
                    <div className="flex flex-wrap gap-2">
                      {PRESET_LOGOS.map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            setLogoImage(preset.dataUri);
                            setErrorLevel('H');
                            setIsLogoSectionExpanded(true);
                          }}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                            logoImage === preset.dataUri
                              ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                              : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:text-white'
                          }`}
                        >
                          <span>{preset.icon}</span>
                          <span>{preset.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fine-Tuning Controls when a photo is selected */}
                  {logoImage && (
                    <div className="space-y-3 pt-2 border-t border-zinc-800/80">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {/* Logo Size */}
                        <div>
                          <div className="flex justify-between text-xs text-zinc-400 mb-1">
                            <span>Photo Size:</span>
                            <span className="font-mono text-zinc-200">{logoSizePercent}%</span>
                          </div>
                          <input
                            type="range"
                            min="15"
                            max="26"
                            value={logoSizePercent}
                            onChange={(e) => setLogoSizePercent(Number(e.target.value))}
                            className="w-full accent-blue-500 cursor-pointer"
                          />
                          <span className="text-[10px] text-zinc-500 block mt-0.5">
                            Safe range: 15%–26% for reliable camera scan
                          </span>
                        </div>

                        {/* Logo Shape */}
                        <div>
                          <span className="text-xs text-zinc-400 block mb-1">Badge Shape:</span>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setLogoShape('circle')}
                              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                logoShape === 'circle'
                                  ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <Circle size={13} />
                              <span>Circle</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setLogoShape('square')}
                              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium border transition ${
                                logoShape === 'square'
                                  ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:text-zinc-200'
                              }`}
                            >
                              <Square size={13} />
                              <span>Rounded</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                        {/* Badge Background Color */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-zinc-400">Badge Background:</label>
                            <button
                              type="button"
                              onClick={() => setLogoBgColor(bgColor)}
                              className="text-[10px] text-blue-400 hover:text-blue-300 underline"
                            >
                              Match QR bg
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={logoBgColor}
                              onChange={(e) => setLogoBgColor(e.target.value)}
                              className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                            />
                            <input
                              type="text"
                              value={logoBgColor}
                              onChange={(e) => setLogoBgColor(e.target.value)}
                              className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-100"
                            />
                          </div>
                        </div>

                        {/* Border Ring */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-xs text-zinc-400">Border Ring Width:</label>
                            <span className="text-xs font-mono text-zinc-300">{logoBorderWidth}px</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="range"
                              min="0"
                              max="6"
                              value={logoBorderWidth}
                              onChange={(e) => setLogoBorderWidth(Number(e.target.value))}
                              className="w-full accent-blue-500 cursor-pointer"
                            />
                            {logoBorderWidth > 0 && (
                              <input
                                type="color"
                                value={logoBorderColor}
                                onChange={(e) => setLogoBorderColor(e.target.value)}
                                className="h-8 w-8 cursor-pointer rounded border border-zinc-700 bg-transparent flex-shrink-0"
                                title="Ring color"
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Custom Styling Controls */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Style & Appearance
                </span>
                <Sliders size={15} className="text-zinc-500" />
              </div>

              {/* Color Presets */}
              <div>
                <span className="text-xs text-zinc-400 block mb-2">Color Themes:</span>
                <div className="flex flex-wrap gap-2">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => {
                        setFgColor(p.fg);
                        setBgColor(p.bg);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600 transition"
                    >
                      <span
                        className="h-3 w-3 rounded-full border border-zinc-700"
                        style={{ backgroundColor: p.fg }}
                      />
                      <span>{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Color Pickers */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Foreground (QR Dots):</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                    />
                    <input
                      type="text"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-100"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Background:</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                    />
                    <input
                      type="text"
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-24 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs font-mono text-zinc-100"
                    />
                  </div>
                </div>
              </div>

              {/* Error Correction & Margin */}
              <div className="grid grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Error Correction:
                    {logoImage && (
                      <span className="ml-1 text-[10px] text-emerald-400 font-normal">
                        (High enforced)
                      </span>
                    )}
                  </label>
                  <select
                    value={logoImage ? 'H' : errorLevel}
                    disabled={!!logoImage}
                    onChange={(e) => setErrorLevel(e.target.value as any)}
                    className={`w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 outline-none ${
                      logoImage ? 'opacity-80 cursor-not-allowed text-zinc-300' : ''
                    }`}
                  >
                    <option value="L">Low (7% recovery, sleekest)</option>
                    <option value="M">Medium (15% recovery, standard)</option>
                    <option value="Q">Quartile (25% recovery)</option>
                    <option value="H">High (30% recovery, durable & photo-ready)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Quiet Zone Margin: {margin}</label>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer mt-2"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live QR Preview & Export Center */}
          <div className="space-y-6 lg:col-span-5">
            <div className="sticky top-20 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 backdrop-blur-md space-y-6 flex flex-col items-center text-center">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-1">
                  Live Preview
                </span>
                <p className="text-xs text-zinc-500">Scan from screen with any smartphone camera</p>
              </div>

              {/* Canvas Preview Container */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="p-4 rounded-2xl shadow-2xl transition-all duration-300 flex items-center justify-center border border-zinc-700/50"
                  style={{ backgroundColor: bgColor }}
                >
                  <canvas ref={canvasRef} className="max-w-full h-auto rounded-lg" />
                </div>
                {logoImage && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 size={13} />
                    <span>Center Photo Embedded (Ready to Scan)</span>
                  </div>
                )}
              </div>

              {/* Payload Preview */}
              <div className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                <span className="text-[10px] uppercase font-semibold text-zinc-500 block mb-1">
                  Encoded Payload:
                </span>
                <p className="text-xs font-mono text-zinc-300 break-all line-clamp-3">
                  {rawQrValue}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="w-full space-y-2.5">
                <button
                  type="button"
                  onClick={downloadPng}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition"
                >
                  <Download size={16} />
                  <span>Download High-Res PNG</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={downloadSvg}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition"
                    title="Scalable Vector for print and designs"
                  >
                    <Download size={14} />
                    <span>Download SVG</span>
                  </button>

                  <button
                    type="button"
                    onClick={copyImage}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 hover:text-white transition"
                  >
                    {copied ? (
                      <Check size={14} className="text-emerald-400" />
                    ) : (
                      <Copy size={14} />
                    )}
                    <span>{copied ? 'Copied!' : 'Copy Image'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
