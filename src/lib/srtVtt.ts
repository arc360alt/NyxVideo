export interface CaptionLike {
  start: number;
  end: number;
  text: string;
}

function pad(n: number, w = 2): string {
  return String(Math.floor(n)).padStart(w, '0');
}

function formatSrtTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)},${pad(ms, 3)}`;
}

function formatVttTime(seconds: number): string {
  return formatSrtTime(seconds).replace(',', '.');
}

export function toSrt(captions: CaptionLike[]): string {
  return captions
    .map((c, i) => `${i + 1}\n${formatSrtTime(c.start)} --> ${formatSrtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

export function toVtt(captions: CaptionLike[]): string {
  const body = captions.map((c) => `${formatVttTime(c.start)} --> ${formatVttTime(c.end)}\n${c.text}\n`).join('\n');
  return `WEBVTT\n\n${body}`;
}
