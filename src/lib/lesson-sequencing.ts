// ============================================================================
// Pedagogical & Lesson Sequencing Engine
// Ensures educational tasks (lessons, chapters, lectures, units, etc.)
// are strictly ordered in natural ascending numerical sequence.
// "How can a user study Lesson 5 before Lesson 2?" -> Enforces Lesson 1 -> 2 -> ... -> N
// ============================================================================

export interface LessonSequenceInfo {
  isStudyTask: boolean;
  sequenceNumber: number | null;
  seriesKey: string; // Grouping identifier (subject / folder / normalized title prefix)
  rawTitle: string;
}

// Arabic number words mapping
const ARABIC_WORD_NUMBERS: Record<string, number> = {
  الاول: 1,
  الأول: 1,
  اول: 1,
  أول: 1,
  الثاني: 2,
  التاني: 2,
  ثاني: 2,
  تانى: 2,
  الثالث: 3,
  التالت: 3,
  ثالث: 3,
  تالت: 3,
  الرابع: 4,
  رابع: 4,
  الخامس: 5,
  خامس: 5,
  السادس: 6,
  سادس: 6,
  السابع: 7,
  سابع: 7,
  الثامن: 8,
  ثامن: 8,
  التاسع: 9,
  تاسع: 9,
  العاشر: 10,
  عاشر: 10,
  'الحادي عشر': 11,
  'الثاني عشر': 12,
  'الثالث عشر': 13,
  'الرابع عشر': 14,
  'الخامس عشر': 15,
};

// Convert Eastern Arabic numerals (٠-٩) to Western (0-9)
export function normalizeArabicDigits(str: string): string {
  const easternDigits = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
  return str.replace(/[٠-٩]/g, (w) => String(easternDigits.indexOf(w)));
}

/**
 * Extracts sequence number and subject series from a task title.
 * Handles English, French, Arabic, and shorthand notations:
 * - "Lesson 1", "Lesson 02", "Lesson 5"
 * - "L1", "L02", "L 5", "Ch 3", "Chapter 4", "Unit 2", "Part 1", "Lecture 6"
 * - "الدرس 1", "الدرس الخامس", "محاضرة 2", "شابتر 3", "فصل 1"
 * - Leading numbers: "1. Grammar", "2 - Algebra", "03) Vectors"
 */
export function extractLessonSequence(title: string, folderName?: string | null): LessonSequenceInfo {
  if (!title || typeof title !== 'string') {
    return { isStudyTask: false, sequenceNumber: null, seriesKey: 'default', rawTitle: '' };
  }

  const cleanTitle = title.trim();
  const normalizedTitle = normalizeArabicDigits(cleanTitle);

  // 1. Explicit Educational Keywords (English & French):
  // Lesson, Lecture, Chapter, Chap, Unit, Part, Section, Topic, Week, Module
  const eduKeywordRegex = /\b(?:lesson|lecture|chapter|chap|ch|unit|part|pt|section|sec|topic|week|wk|module|mod)\b[\s.:#\-_–]*(\d+(?:\.\d+)?)/i;
  const matchEdu = normalizedTitle.match(eduKeywordRegex);
  if (matchEdu) {
    const num = parseFloat(matchEdu[1]);
    const seriesKey = extractSeriesKey(normalizedTitle, folderName);
    return {
      isStudyTask: true,
      sequenceNumber: num,
      seriesKey,
      rawTitle: cleanTitle,
    };
  }

  // 2. Shorthand notation like L1, L02, Ch3, U2, Lec4, Pt1 (word boundary or prefix)
  const shorthandRegex = /\b(?:l|ch|u|pt|lec|mod)[-_.\s]*(\d{1,3})\b/i;
  const matchShorthand = normalizedTitle.match(shorthandRegex);
  if (matchShorthand) {
    const num = parseInt(matchShorthand[1], 10);
    const seriesKey = extractSeriesKey(normalizedTitle, folderName);
    return {
      isStudyTask: true,
      sequenceNumber: num,
      seriesKey,
      rawTitle: cleanTitle,
    };
  }

  // 3. Arabic Educational Keywords with numbers:
  // الدرس 1, محاضرة 2, شابتر 3, فصل 1, الوحدة 2, الجزء 1
  const arabicKeywordRegex = /(?:الدرس|درس|محاضرة|محاضره|شابتر|فصل|الفصل|الوحدة|الوحده|الجزء|جزء|مقرر|موضوع)[\s.:#\-_–]*(\d+)/i;
  const matchArabicNum = normalizedTitle.match(arabicKeywordRegex);
  if (matchArabicNum) {
    const num = parseInt(matchArabicNum[1], 10);
    const seriesKey = extractSeriesKey(normalizedTitle, folderName);
    return {
      isStudyTask: true,
      sequenceNumber: num,
      seriesKey,
      rawTitle: cleanTitle,
    };
  }

  // 4. Arabic Educational Keywords with word numbers:
  // الدرس الاول, الدرس الخامس, المحاضرة الثانية
  for (const [word, val] of Object.entries(ARABIC_WORD_NUMBERS)) {
    const wordPattern = new RegExp(`(?:الدرس|درس|محاضرة|محاضره|شابتر|فصل|الفصل|الوحدة|الوحده|الجزء)\\s+${word}`, 'i');
    if (wordPattern.test(normalizedTitle)) {
      const seriesKey = extractSeriesKey(normalizedTitle, folderName);
      return {
        isStudyTask: true,
        sequenceNumber: val,
        seriesKey,
        rawTitle: cleanTitle,
      };
    }
  }

  // 5. Leading number list format:
  // "1. Grammar", "2 - Algebra", "03) Vectors", "1: French Intro"
  const leadingNumRegex = /^(\d{1,3})[\s.:\-–)\]]+(.+)$/;
  const matchLeading = normalizedTitle.match(leadingNumRegex);
  if (matchLeading) {
    const num = parseInt(matchLeading[1], 10);
    const seriesKey = extractSeriesKey(matchLeading[2], folderName);
    return {
      isStudyTask: true,
      sequenceNumber: num,
      seriesKey,
      rawTitle: cleanTitle,
    };
  }

  // 6. Check if folder indicates an educational/study course and title has ANY number
  const isStudyFolder = folderName && isEducationalFolder(folderName);
  if (isStudyFolder) {
    const anyNumMatch = normalizedTitle.match(/(\d+)/);
    if (anyNumMatch) {
      return {
        isStudyTask: true,
        sequenceNumber: parseInt(anyNumMatch[1], 10),
        seriesKey: folderName.toLowerCase().trim(),
        rawTitle: cleanTitle,
      };
    }
  }

  return {
    isStudyTask: isStudyFolder || false,
    sequenceNumber: null,
    seriesKey: folderName ? folderName.toLowerCase().trim() : 'general',
    rawTitle: cleanTitle,
  };
}

/**
 * Extracts a normalized subject/series key from the title or folder name.
 * e.g., "French AL - Lesson 2" -> "french al"
 * e.g., "Physics - Ch 4" -> "physics"
 */
function extractSeriesKey(title: string, folderName?: string | null): string {
  if (folderName && folderName.trim().length > 0) {
    return folderName.toLowerCase().trim();
  }

  // Look for subject prefix before hyphens or colons:
  // "French: Lesson 2" -> "french"
  // "Physics - Chapter 1" -> "physics"
  const prefixMatch = title.match(/^([a-zA-Z\u0600-\u06FF\s]+)[\s\-–:]+(?:lesson|lecture|chapter|unit|part|l|ch|الدرس|محاضرة)/i);
  if (prefixMatch && prefixMatch[1].trim().length > 1) {
    return prefixMatch[1].toLowerCase().trim();
  }

  return 'study-series';
}

/**
 * Determines whether a folder name represents an academic subject, exam, or course.
 */
export function isEducationalFolder(folderName: string): boolean {
  const norm = folderName.toLowerCase();
  return (
    norm.includes('study') ||
    norm.includes('exam') ||
    norm.includes('school') ||
    norm.includes('university') ||
    norm.includes('college') ||
    norm.includes('course') ||
    norm.includes('class') ||
    norm.includes('french') ||
    norm.includes('english') ||
    norm.includes('math') ||
    norm.includes('physic') ||
    norm.includes('chemist') ||
    norm.includes('biolog') ||
    norm.includes('history') ||
    norm.includes('geograph') ||
    norm.includes('al') ||
    norm.includes('ol') ||
    norm.includes('igcse') ||
    norm.includes('sat') ||
    norm.includes('ثانوية') ||
    norm.includes('مذاكرة') ||
    norm.includes('امتحان') ||
    norm.includes('دروس')
  );
}

/**
 * Sorts an array of tasks so that educational lessons are strictly arranged
 * in natural ascending pedagogical order (Lesson 1 before Lesson 2, Lesson 2 before Lesson 5).
 * Non-educational tasks or tasks without sequence numbers retain their relative placement.
 */
export function sortTasksByLessonSequence<
  T extends {
    title: string;
    folder_id?: string | null;
    created_at?: string;
    priority?: string;
    [key: string]: any;
  }
>(tasks: T[], folderMap?: Map<string, { name: string }>): T[] {
  if (!tasks || tasks.length <= 1) return tasks || [];

  // Parse each task with its lesson info
  const enriched = tasks.map((task, index) => {
    const folderName = task.folder_id && folderMap ? folderMap.get(task.folder_id)?.name : null;
    const lessonInfo = extractLessonSequence(task.title, folderName);
    return {
      task,
      originalIndex: index,
      lessonInfo,
    };
  });

  // Group by seriesKey
  enriched.sort((a, b) => {
    // If both belong to the same series and both have sequence numbers:
    if (
      a.lessonInfo.seriesKey === b.lessonInfo.seriesKey &&
      a.lessonInfo.sequenceNumber !== null &&
      b.lessonInfo.sequenceNumber !== null
    ) {
      if (a.lessonInfo.sequenceNumber !== b.lessonInfo.sequenceNumber) {
        return a.lessonInfo.sequenceNumber - b.lessonInfo.sequenceNumber;
      }
    }

    // If only one has a sequence number within the same series, numbered lessons come first
    if (
      a.lessonInfo.seriesKey === b.lessonInfo.seriesKey &&
      a.lessonInfo.sequenceNumber !== null &&
      b.lessonInfo.sequenceNumber === null
    ) {
      return -1;
    }
    if (
      a.lessonInfo.seriesKey === b.lessonInfo.seriesKey &&
      a.lessonInfo.sequenceNumber === null &&
      b.lessonInfo.sequenceNumber !== null
    ) {
      return 1;
    }

    // Otherwise maintain original array order
    return a.originalIndex - b.originalIndex;
  });

  return enriched.map((item) => item.task);
}

/**
 * Validates that an ordered list of tasks does not contain an inverted lesson sequence.
 * Returns true if valid (e.g. Lesson 2 comes before Lesson 5), false if inverted.
 */
export function isLessonSequenceValid<
  T extends { title: string; folder_id?: string | null }
>(tasks: T[]): { isValid: boolean; violation?: string } {
  const seenSeriesMaxNumber = new Map<string, number>();

  for (const t of tasks) {
    const info = extractLessonSequence(t.title);
    if (info.sequenceNumber !== null) {
      const currentMax = seenSeriesMaxNumber.get(info.seriesKey);
      if (currentMax !== undefined && info.sequenceNumber < currentMax) {
        return {
          isValid: false,
          violation: `Inverted study sequence: "${t.title}" (number ${info.sequenceNumber}) is scheduled after a higher lesson (number ${currentMax}) in "${info.seriesKey}".`,
        };
      }
      seenSeriesMaxNumber.set(info.seriesKey, Math.max(currentMax || 0, info.sequenceNumber));
    }
  }

  return { isValid: true };
}
