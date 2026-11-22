// ============================================================================
// Evolve Platform - Premium AI Daily Schedule PDF Export Generator
// Exports a luxury, executive A4 PDF matching the website's dark slate & neon theme
// with official branding, logo, KPI cards, timeline schedule, and AI directives.
// ============================================================================

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { DailyScheduleItem, Task, TaskFolder } from '@/types';

export interface DailySchedulePdfData {
  userName: string;
  date: string; // YYYY-MM-DD
  sessions: DailyScheduleItem[];
  tasks: Task[];
  folders: TaskFolder[];
  preferences?: {
    startTime?: string;
    endTime?: string;
    highFocusStart?: string;
    highFocusEnd?: string;
    preferredBreakDuration?: number;
  };
}

// Strip emojis & non-ASCII characters that can cause mojibake / corrupted glyphs in standard PDF fonts
function stripEmojis(str: string): string {
  if (!str) return '';
  return str
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ''
    )
    .replace(/[^\x00-\x7F]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Loads the application logo from /logo.png as a Base64 Data URL for embedding into jsPDF
 */
async function getLogoDataUrl(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
            return;
          }
        } catch {
          // ignore canvas extraction error
        }
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = '/logo.png';
    } catch {
      resolve(null);
    }
  });
}

/**
 * Generates and downloads a premium, executive designed Day Schedule PDF
 */
export async function generateDailySchedulePdf(data: DailySchedulePdfData): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 28; // 14mm margin left and right

  // Attempt to load the app logo
  const logoDataUrl = await getLogoDataUrl();

  // ── 1. Top Executive Brand Header ──────────────────────────────────────────
  // Deep navy brand banner (Slate-950: #070b14)
  doc.setFillColor(7, 11, 20);
  doc.rect(0, 0, pageWidth, 40, 'F');

  // Decorative blue/violet ambient background glow block
  doc.setFillColor(30, 41, 59);
  doc.rect(0, 0, 3, 40, 'F');

  let textStartX = 14;

  // Render Logo
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'PNG', 14, 7, 24, 24);
      textStartX = 42;
    } catch {
      // Fallback to geometric brand badge
      drawBrandBadge(doc, 14, 8);
      textStartX = 42;
    }
  } else {
    drawBrandBadge(doc, 14, 8);
    textStartX = 42;
  }

  // App Brand Name & Tagline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('EVOLVE', textStartX, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(56, 189, 248); // Cyan-400
  doc.text('PERSONAL AI LIFE OPERATING SYSTEM', textStartX, 24);

  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184); // Slate-400
  doc.text('AI DAILY SCHEDULE & EXECUTIVE PRODUCTIVITY PLAN', textStartX, 29);

  // Right Header: Date, User & AI Status
  const dateObj = new Date(data.date + 'T00:00:00');
  const formattedDate = dateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(formattedDate, pageWidth - 14, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  const cleanUserName = stripEmojis(data.userName) || 'Evolve User';
  doc.text(`Prepared for: ${cleanUserName}`, pageWidth - 14, 22, { align: 'right' });

  // Status Badge Pill
  doc.setFillColor(37, 99, 235); // Blue-600
  doc.roundedRect(pageWidth - 52, 26, 38, 5.5, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text('AI OPTIMIZED PLAN', pageWidth - 33, 30, { align: 'center' });

  // Glowing Gradient Divider Line below header
  doc.setFillColor(59, 130, 246); // Blue-500
  doc.rect(0, 40, pageWidth, 1.5, 'F');

  // ── 2. Calculate Summary Metrics ───────────────────────────────────────────
  const taskSessions = data.sessions.filter((s) => s.session_type === 'task');
  const breakSessions = data.sessions.filter((s) => s.session_type === 'break');
  const totalPlannedMin = data.sessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
  const totalBreakMin = breakSessions.reduce((acc, s) => acc + (s.duration_minutes || 0), 0);
  const completedSessions = data.sessions.filter((s) => s.is_completed);
  const completionRate = data.sessions.length > 0
    ? Math.round((completedSessions.length / data.sessions.length) * 100)
    : 0;

  // ── 3. Section: Daily KPI Overview Cards ───────────────────────────────────
  let currentY = 48;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // Slate-900
  doc.text('1. Day Overview & Execution Metrics', 14, currentY);
  currentY += 4;

  const cardWidth = (contentWidth - 9) / 4; // 4 cards with 3mm gap
  const cardHeight = 20;

  const kpis = [
    {
      label: 'Planned Focus',
      value: `${(totalPlannedMin / 60).toFixed(1)} hrs`,
      sub: `${taskSessions.length} Study Sessions`,
      color: [37, 99, 235], // Blue
    },
    {
      label: 'Rest & Recovery',
      value: `${totalBreakMin} mins`,
      sub: `${breakSessions.length} Scheduled Breaks`,
      color: [217, 119, 6], // Amber
    },
    {
      label: 'Execution Status',
      value: `${completionRate}%`,
      sub: `${completedSessions.length} of ${data.sessions.length} Completed`,
      color: [16, 185, 129], // Emerald
    },
    {
      label: 'Daily Schedule Window',
      value: `${data.preferences?.startTime || '08:00'} - ${data.preferences?.endTime || '21:00'}`,
      sub: `Peak: ${data.preferences?.highFocusStart || '09:00'} - ${data.preferences?.highFocusEnd || '12:00'}`,
      color: [124, 58, 237], // Violet
    },
  ];

  kpis.forEach((kpi, idx) => {
    const cardX = 14 + idx * (cardWidth + 3);

    // Card background
    doc.setFillColor(248, 250, 252); // Slate-50
    doc.setDrawColor(226, 232, 240); // Slate-200
    doc.roundedRect(cardX, currentY, cardWidth, cardHeight, 2, 2, 'FD');

    // Accent line on left of card
    doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    doc.rect(cardX, currentY, 1.5, cardHeight, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139); // Slate-500
    doc.text(kpi.label.toUpperCase(), cardX + 3.5, currentY + 5);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42); // Slate-900
    doc.text(kpi.value, cardX + 3.5, currentY + 11.5);

    // Subtext
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(kpi.sub, cardX + 3.5, currentY + 16.5);
  });

  currentY += cardHeight + 8;

  // ── 4. Section: AI Schedule Timeline Table ────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Planned Daily Schedule Timeline', 14, currentY);
  currentY += 3;

  // Build task/folder map
  const foldersMap = new Map<string, TaskFolder>();
  data.folders.forEach((f) => foldersMap.set(f.id, f));

  const tasksMap = new Map<string, Task>();
  data.tasks.forEach((t) => tasksMap.set(t.id, t));

  const tableRows = data.sessions.map((s) => {
    const isBreak = s.session_type === 'break';
    const timeCol = `${s.start_time} - ${s.end_time}`;
    const cleanTitle = stripEmojis(s.title) || (isBreak ? 'Short Break' : 'Scheduled Task');

    let categoryCol = isBreak ? 'Rest & Refresh' : 'General Task';
    let priorityCol = isBreak ? 'Rest' : 'Normal';

    if (s.task_id) {
      const task = tasksMap.get(s.task_id);
      if (task) {
        if (task.folder_id && foldersMap.has(task.folder_id)) {
          categoryCol = stripEmojis(foldersMap.get(task.folder_id)!.name);
        }
        const prio = task.priority ? task.priority.toUpperCase() : 'NORMAL';
        const diff = task.difficulty ? task.difficulty.toUpperCase() : 'MED';
        priorityCol = `${prio} / ${diff}`;
      }
    }

    const durationCol = `${s.duration_minutes}m`;
    const statusCol = s.is_completed ? '[DONE] Completed' : isBreak ? '[BREAK] Planned' : '[PENDING] Scheduled';

    return [timeCol, cleanTitle, categoryCol, durationCol, priorityCol, statusCol];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Time Window', 'Session / Task Title', 'Subject / Folder', 'Duration', 'Priority / Diff', 'Status']],
    body: tableRows,
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42], // Slate-900
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.8,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
    },
    columnStyles: {
      0: { fontStyle: 'bold', halign: 'center', cellWidth: 26 },
      1: { fontStyle: 'bold', cellWidth: 54 },
      2: { cellWidth: 32 },
      3: { halign: 'center', cellWidth: 18 },
      4: { halign: 'center', cellWidth: 26 },
      5: { halign: 'center', cellWidth: 26, fontStyle: 'bold' },
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    didParseCell: (dataCell) => {
      // Highlight break rows with gentle amber tint
      const rowRaw = dataCell.row.raw as string[];
      if (rowRaw && rowRaw[1] && (rowRaw[1].toLowerCase().includes('break') || rowRaw[5]?.includes('[BREAK]'))) {
        dataCell.cell.styles.fillColor = [254, 249, 195]; // Yellow-100
        dataCell.cell.styles.textColor = [161, 98, 7]; // Yellow-800
      }
      // Highlight completed status in emerald
      if (dataCell.column.index === 5 && dataCell.cell.raw === '[DONE] Completed') {
        dataCell.cell.styles.textColor = [16, 185, 129]; // Emerald-500
      }
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 8;

  // ── 5. Section: AI Productivity & Clarity Directive ────────────────────────
  if (currentY + 28 <= pageHeight - 20) {
    doc.setFillColor(240, 249, 255); // Sky-50
    doc.setDrawColor(186, 230, 253); // Sky-200
    doc.roundedRect(14, currentY, contentWidth, 24, 2, 2, 'FD');

    // Left cyan accent bar
    doc.setFillColor(14, 165, 233); // Sky-500
    doc.rect(14, currentY, 1.5, 24, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(3, 105, 161); // Sky-700
    doc.text('AI EXECUTIVE DIRECTIVE & COGNITIVE PACING', 18, currentY + 5.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85); // Slate-700
    doc.text(
      '• High-focus deep study sessions are prioritized during your peak energy hours.',
      18,
      currentY + 11
    );
    doc.text(
      '• Mandatory recovery breaks are spaced between intensive tasks to eliminate mental fatigue.',
      18,
      currentY + 15.5
    );
    doc.text(
      '• Check off sessions in your Evolve AI Planner to sync streaks and activate ambient noise guard.',
      18,
      currentY + 20
    );
  }

  // ── 6. Page Numbers & Luxury Footer on All Pages ───────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Divider line above footer
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    // Footer text
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text(
      'Evolve Personal AI Life Operating System • Confidential & Personal Daily Schedule Plan',
      14,
      pageHeight - 7
    );

    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 14, pageHeight - 7, { align: 'right' });
  }

  // ── 7. Save and Trigger Download ───────────────────────────────────────────
  const cleanDate = data.date.replace(/[^0-9-]/g, '');
  const filename = `Evolve_Daily_Schedule_${cleanDate}.pdf`;
  doc.save(filename);
}

/**
 * Geometric vector logo badge fallback
 */
function drawBrandBadge(doc: jsPDF, x: number, y: number) {
  doc.setFillColor(79, 70, 229); // Indigo-600
  doc.roundedRect(x, y, 22, 22, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text('E', x + 7, y + 16);
}
