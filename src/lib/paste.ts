export function getRecentContext(_upToIndex: number): string[] {
  return [];
}

export function parseChatLog(raw: string): {
  id: string;
  ts_offset_ms: number;
  username: string;
  text: string;
  sourceIndex: number;
}[] {
  const out: {
    id: string;
    ts_offset_ms: number;
    username: string;
    text: string;
    sourceIndex: number;
  }[] = [];
  let i = 0;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let ts = 0;
    let rest = trimmed;
    const tsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})\s+/);
    if (tsMatch) {
      ts =
        (Number(tsMatch[1]) * 3600 + Number(tsMatch[2]) * 60 + Number(tsMatch[3])) *
        1000;
      rest = trimmed.slice(tsMatch[0].length);
    }
    const colon = rest.indexOf(":");
    if (colon === -1) continue;
    const username = rest.slice(0, colon).trim();
    const text = rest.slice(colon + 1).trim();
    if (!username || !text) continue;
    const prev = out[out.length - 1];
    let ts_offset_ms = ts;
    if (ts === 0 && prev) {
      ts_offset_ms = prev.ts_offset_ms + 2000;
    } else if (prev && ts_offset_ms <= prev.ts_offset_ms) {
      ts_offset_ms = prev.ts_offset_ms + 1;
    }
    out.push({
      id: `paste-${i}`,
      ts_offset_ms,
      username,
      text,
      sourceIndex: i,
    });
    i++;
  }
  return out;
}
