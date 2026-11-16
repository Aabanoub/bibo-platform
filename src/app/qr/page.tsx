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
} from 'lucide-react';

type QRType = 'url' | 'text' | 'wifi' | 'vcard' | 'email' | 'phone' | 'whatsapp' | 'crypto';

interface ColorPreset {
  name: string;
  fg: string;
  bg: string;
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
        errorCorrectionLevel: errorLevel,
      },
      (err) => {
        if (err) console.error('QR code generation error:', err);
      }
    );
  }, [rawQrValue, fgColor, bgColor, errorLevel, qrSize, margin]);

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
      const svgString = await QRCode.toString(rawQrValue, {
        type: 'svg',
        width: qrSize,
        margin,
        color: {
          dark: fgColor,
          light: bgColor,
        },
        errorCorrectionLevel: errorLevel,
      });

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
      const noteContent = `### QR Code Information\n- **Type:** ${activeType}\n- **Data / Payload:** \`${rawQrValue}\`\n- **Generated At:** ${new Date().toLocaleString()}\n\nScan this code from your screen or download the image.`;

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
    <div className="flex h-full min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
            <QrCode size={20} />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight">QR Code Studio</h1>
            <p className="text-xs text-zinc-400">Generate custom QR codes for anything</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={saveToNotes}
            disabled={savingNote}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600 hover:bg-zinc-800 hover:text-white transition"
            title="Save payload to Notes"
          >
            {noteSaved ? (
              <Check size={14} className="text-emerald-400" />
            ) : (
              <Save size={14} />
            )}
            <span className="hidden sm:inline">
              {noteSaved ? 'Saved to Notes!' : 'Save to Notes'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6">
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
                  <label className="text-xs text-zinc-400 block mb-1">Error Correction:</label>
                  <select
                    value={errorLevel}
                    onChange={(e) => setErrorLevel(e.target.value as any)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-100 outline-none"
                  >
                    <option value="L">Low (7% recovery, sleekest)</option>
                    <option value="M">Medium (15% recovery, standard)</option>
                    <option value="Q">Quartile (25% recovery)</option>
                    <option value="H">High (30% recovery, durable)</option>
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
              <div
                className="p-4 rounded-2xl shadow-2xl transition-all duration-300 flex items-center justify-center border border-zinc-700/50"
                style={{ backgroundColor: bgColor }}
              >
                <canvas ref={canvasRef} className="max-w-full h-auto rounded-lg" />
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
