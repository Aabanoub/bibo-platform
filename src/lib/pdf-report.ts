import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface WeeklyPdfData {
  userName: string;
  startDate: string;
  endDate: string;
  stats: {
    income: number;
    expense: number;
    netSavings: number;
    savingsRate: number;
    completedTasks: number;
    totalTasks: number;
    taskCompletionRate: number;
    habitLogsCount: number;
    activeHabitsCount: number;
    notesCreated: number;
  };
  transactions?: {
    date: string;
    description: string;
    category: string;
    type: 'income' | 'expense';
    amount: number;
  }[];
  tasks?: {
    title: string;
    priority: string;
    status: string;
  }[];
  aiSynthesis?: string;
}

// Helper to remove emoji characters that cause mojibake / corrupted glyphs in standard PDF fonts
function stripEmojis(str: string): string {
  return str
    .replace(
      /([\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD10-\uDDFF])/g,
      ''
    )
    .replace(/[^\x00-\x7F]/g, '') // Keep clean ASCII text for PDF compatibility
    .replace(/\s+/g, ' ')
    .trim();
}

export function generateWeeklyReportPdf(data: WeeklyPdfData) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  // ── Header Banner ──────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text('Bibo Platform — Life OS Executive Review', 14, 16);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184); // slate-400
  doc.text(
    `Prepared for: ${stripEmojis(data.userName)} | Period: ${data.startDate} to ${data.endDate} | Generated: ${new Date().toLocaleDateString()}`,
    14,
    26
  );

  let currentY = 44;

  // ── Section 1: Executive KPI Table ─────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(30, 41, 59); // slate-800
  doc.text('1. Executive KPI Summary', 14, currentY);
  currentY += 4;

  const kpiRows = [
    [
      'Total Money In (Income)',
      `$${data.stats.income.toFixed(2)}`,
      data.stats.income > 0 ? 'Received' : 'None',
    ],
    [
      'Total Money Out (Expenses)',
      `$${data.stats.expense.toFixed(2)}`,
      data.stats.expense > 0 ? 'Disbursed' : 'None',
    ],
    [
      'Net Cash Flow / Savings',
      `$${data.stats.netSavings.toFixed(2)}`,
      data.stats.netSavings >= 0 ? 'Positive Surplus (+)' : 'Deficit (-)',
    ],
    [
      'Weekly Savings Rate',
      `${data.stats.savingsRate}%`,
      data.stats.savingsRate >= 20 ? 'Target Met (>=20%)' : 'Needs attention',
    ],
    [
      'Task Execution Rate',
      `${data.stats.taskCompletionRate}%`,
      `${data.stats.completedTasks} of ${data.stats.totalTasks} completed`,
    ],
    [
      'Habit Consistency Logs',
      `${data.stats.habitLogsCount} sessions`,
      `Across ${data.stats.activeHabitsCount} daily habits`,
    ],
    [
      'Knowledge & Notes Logged',
      `${data.stats.notesCreated} entries`,
      'Thoughts and ideas captured',
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    head: [['Performance Metric', 'Recorded Value', 'Operational Status']],
    body: kpiRows,
    theme: 'striped',
    headStyles: {
      fillColor: [37, 99, 235], // blue-600
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 9,
    },
    styles: {
      fontSize: 9,
      cellPadding: 2.5,
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // slate-50
    },
  });

  currentY = (doc as any).lastAutoTable.finalY + 10;

  // ── Section 2: Financial Breakdown Table (if transactions exist) ───────────
  if (data.transactions && data.transactions.length > 0) {
    if (currentY > 230) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('2. Financial Activity Ledger', 14, currentY);
    currentY += 4;

    const txRows = data.transactions.slice(0, 15).map((t) => [
      t.date,
      stripEmojis(t.description || t.category),
      stripEmojis(t.category),
      t.type.toUpperCase(),
      `${t.type === 'income' ? '+' : '-'}$${Math.abs(t.amount).toFixed(2)}`,
    ]);

    autoTable(doc, {
      startY: currentY,
      head: [['Date', 'Description', 'Category', 'Type', 'Amount']],
      body: txRows,
      theme: 'grid',
      headStyles: {
        fillColor: [16, 185, 129], // emerald-600
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 9,
      },
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
      },
      columnStyles: {
        4: { fontStyle: 'bold', halign: 'right' },
      },
    });

    currentY = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Section 3: AI Executive Coach Synthesis ────────────────────────────────
  if (data.aiSynthesis) {
    if (currentY > 210) {
      doc.addPage();
      currentY = 20;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(30, 41, 59);
    doc.text('3. AI Executive Coaching & Strategic Synthesis', 14, currentY);
    currentY += 6;

    // Strip markdown formatting and emojis for clean text rendering in PDF
    const cleanAiText = stripEmojis(
      data.aiSynthesis
        .replace(/###/g, '')
        .replace(/##/g, '')
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .trim()
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(51, 65, 85); // slate-700

    const splitText = doc.splitTextToSize(cleanAiText, pageWidth - 28);

    // If text exceeds page, let it flow cleanly
    doc.text(splitText, 14, currentY);
  }

  // ── Footer on all pages ────────────────────────────────────────────────────
  const pageCount = (doc.internal as any).getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Bibo Platform Life OS Report — Confidential — Page ${i} of ${pageCount}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  // Download PDF
  const filename = `Life_OS_Review_${data.startDate}_to_${data.endDate}.pdf`;
  doc.save(filename);
}
