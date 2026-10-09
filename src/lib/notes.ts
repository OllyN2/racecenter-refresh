import type { LapNotes, RaceNotesFeed } from './types';

/** A run of text in a note paragraph; `strong` keeps the driver names NASCAR bolds in its snapshots. */
export interface Segment {
  text: string;
  strong: boolean;
}

/** One timeline entry, from either NASCAR's AI race notes or the reporters' lap notes. */
export interface TimelineNote {
  id: string;
  lap: number;
  /** Category NASCAR gives the note ("Driver Battles", "Restart", "Race Snapshot", …); empty for lap notes. */
  section: string;
  /** 1 green, 2 caution, 3 red, 4 checkered, 1000 milestone. */
  flag: number;
  paragraphs: Segment[][];
  /** Plain text, for filtering. */
  text: string;
}

/**
 * Snapshot notes arrive as HTML from a third-party feed, so they're never injected into the page: DOMParser reads
 * them (it doesn't run scripts) and only paragraph text and <strong> runs are kept.
 */
export function toParagraphs(content: string): Segment[][] {
  if (!/<[a-z][^>]*>/i.test(content)) {
    return content
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((text) => [{ text, strong: false }]);
  }
  const body = new DOMParser().parseFromString(content, 'text/html').body;
  const blocks = body.querySelectorAll('p').length ? [...body.querySelectorAll('p')] : [body];
  return blocks
    .map((el) =>
      [...el.childNodes].map((n) => ({
        text: n.textContent ?? '',
        strong: n.nodeName === 'STRONG' || n.nodeName === 'B',
      })),
    )
    .filter((segs) => segs.some((s) => s.text.trim()));
}

const plain = (paragraphs: Segment[][]) => paragraphs.map((p) => p.map((s) => s.text).join('')).join(' ');

export function fromAiNotes(feed: RaceNotesFeed): TimelineNote[] {
  return (feed.summary ?? []).map((n) => {
    const paragraphs = toParagraphs(n.content ?? '');
    return { id: n.noteID, lap: Number(n.lap) || 0, section: (n.section ?? '').trim(), flag: n.flag, paragraphs, text: `${n.section} ${plain(paragraphs)}` };
  });
}

export function fromLapNotes(feed: LapNotes): TimelineNote[] {
  return Object.entries(feed.laps ?? {}).flatMap(([lap, list]) =>
    list.map((n) => ({
      id: String(n.NoteID),
      lap: Number(lap) || 0,
      section: '',
      flag: n.FlagState,
      paragraphs: [[{ text: n.Note, strong: false }]],
      text: n.Note,
    })),
  );
}
