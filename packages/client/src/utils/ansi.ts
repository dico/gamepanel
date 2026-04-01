/**
 * Parse ANSI escape codes and return an array of { text, color } segments.
 * Supports basic 8-color and bright variants (codes 30-37, 90-97).
 */

const ANSI_COLORS: Record<number, string> = {
  30: '#4e4e4e', 31: '#f85149', 32: '#3fb950', 33: '#d29922',
  34: '#58a6ff', 35: '#bc8cff', 36: '#39c5cf', 37: '#c9d1d9',
  90: '#6e7681', 91: '#ff7b72', 92: '#56d364', 93: '#e3b341',
  94: '#79c0ff', 95: '#d2a8ff', 96: '#56d4dd', 97: '#f0f3f6',
};

export interface AnsiSegment {
  text: string;
  color: string | null;
  bold: boolean;
}

export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = [];
  // Match ANSI escape sequences: ESC[ ... m
  const regex = /\x1b\[([0-9;]*)m/g;
  let lastIndex = 0;
  let currentColor: string | null = null;
  let bold = false;

  let match;
  while ((match = regex.exec(input)) !== null) {
    // Add text before this escape
    if (match.index > lastIndex) {
      const text = input.slice(lastIndex, match.index);
      if (text) segments.push({ text, color: currentColor, bold });
    }

    // Parse codes
    const codes = match[1].split(';').map(Number);
    for (const code of codes) {
      if (code === 0) { currentColor = null; bold = false; }
      else if (code === 1) { bold = true; }
      else if (code === 39) { currentColor = null; }
      else if (ANSI_COLORS[code]) { currentColor = ANSI_COLORS[code]; }
    }

    lastIndex = regex.lastIndex;
  }

  // Remaining text
  if (lastIndex < input.length) {
    const text = input.slice(lastIndex);
    if (text) segments.push({ text, color: currentColor, bold });
  }

  return segments.length > 0 ? segments : [{ text: input, color: null, bold: false }];
}
