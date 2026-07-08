import { NoiseItem, SideItem, Tape, TrackItem } from "@/hooks/useAudioPlayer";

// 공유 페이로드 포맷: "CT2:" + base64(JSON)
// Hermes에는 btoa/atob이 없으므로 UTF-8 안전 base64를 직접 구현
const SHARE_PREFIX = "CT2:";
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8Encode(str: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    const code = str.codePointAt(i)!;
    if (code > 0xffff) i++; // surrogate pair
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else
      bytes.push(
        0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63),
        0x80 | ((code >> 6) & 63), 0x80 | (code & 63)
      );
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let code: number;
    if (b < 0x80) { code = b; i += 1; }
    else if (b < 0xe0) { code = ((b & 31) << 6) | (bytes[i + 1] & 63); i += 2; }
    else if (b < 0xf0) {
      code = ((b & 15) << 12) | ((bytes[i + 1] & 63) << 6) | (bytes[i + 2] & 63);
      i += 3;
    } else {
      code = ((b & 7) << 18) | ((bytes[i + 1] & 63) << 12) |
        ((bytes[i + 2] & 63) << 6) | (bytes[i + 3] & 63);
      i += 4;
    }
    out += String.fromCodePoint(code);
  }
  return out;
}

function base64Encode(str: string): string {
  const bytes = utf8Encode(str);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? "=" : B64_CHARS[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? "=" : B64_CHARS[b2 & 63];
  }
  return out;
}

function base64Decode(b64: string): string {
  const clean = b64.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const val = B64_CHARS.indexOf(ch);
    if (val === -1) throw new Error("invalid base64");
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return utf8Decode(bytes);
}

interface SharePayload {
  v: 1;
  name: string;
  sideA: SideItem[];
  sideB: SideItem[];
}

// 로컬 파일 트랙은 다른 기기에서 재생 불가 → 공유에서 제외하고 노이즈 중복 정리
function shareableSide(items: SideItem[]): { items: SideItem[]; removed: number } {
  const kept: SideItem[] = [];
  let removed = 0;
  for (const it of items) {
    if (it.type === "track") {
      if (it.sourceType === "youtube" || it.sourceType === "stream") kept.push(it);
      else removed++;
    } else if (kept.length === 0 || kept[kept.length - 1].type !== "noise") {
      kept.push(it);
    }
  }
  if (!kept.some((it) => it.type === "track")) return { items: [], removed };
  return { items: kept, removed };
}

export interface TapeShareResult {
  text: string;
  sharedTrackCount: number;
  removedLocalCount: number;
}

export function encodeTapeShare(tape: Tape): TapeShareResult {
  const a = shareableSide(tape.sideA);
  const b = shareableSide(tape.sideB);
  const payload: SharePayload = { v: 1, name: tape.name, sideA: a.items, sideB: b.items };
  const countTracks = (items: SideItem[]) => items.filter((it) => it.type === "track").length;
  const aCount = countTracks(a.items);
  const bCount = countTracks(b.items);
  const code = SHARE_PREFIX + base64Encode(JSON.stringify(payload));
  // 공유 문구는 받는 사람의 언어를 알 수 없으므로 앱 UI와 동일하게 영어로 통일
  const text = [
    "📼 Cassette Player 2 — Mixtape",
    `「${tape.name}」 · Side A: ${aCount} track${aCount === 1 ? "" : "s"} / Side B: ${bCount} track${bCount === 1 ? "" : "s"}`,
    "",
    "Paste this whole message into [Import Tape] in Cassette Player 2.",
    "",
    code,
  ].join("\n");
  return { text, sharedTrackCount: aCount + bCount, removedLocalCount: a.removed + b.removed };
}

function isValidItem(it: any): it is SideItem {
  if (!it || typeof it !== "object") return false;
  if (it.type === "noise") return typeof it.id === "string" && typeof it.duration === "number";
  if (it.type === "track")
    return typeof it.id === "string" && typeof it.title === "string" &&
      typeof it.duration === "number" && typeof it.uri === "string";
  return false;
}

function sanitizeItems(items: any): SideItem[] {
  if (!Array.isArray(items)) return [];
  return items.filter(isValidItem).map((it) =>
    it.type === "noise"
      ? ({ id: it.id, type: "noise", duration: it.duration } as NoiseItem)
      : ({
          id: it.id, type: "track", title: it.title, duration: it.duration,
          uri: it.uri, sourceType: it.sourceType, youtubeId: it.youtubeId,
        } as TrackItem)
  );
}

function tapeFromBase64(b64: string): Tape | null {
  try {
    const payload = JSON.parse(base64Decode(b64));
    if (payload?.v !== 1 || typeof payload.name !== "string") return null;
    const now = Date.now();
    return {
      id: `tape_${now}_${Math.random().toString(36).slice(2, 6)}`,
      name: payload.name,
      sideA: sanitizeItems(payload.sideA),
      sideB: sanitizeItems(payload.sideB),
      createdAt: now,
      updatedAt: now,
      sharedFrom: payload.name,
    };
  } catch {
    return null;
  }
}

// 공유 텍스트에서 테이프 복원. 실패 시 null
// 전체 메시지를 그대로 붙여넣어도 CT2 코드 부분만 찾아서 파싱한다.
// 1차: 한 덩어리 코드(정상 케이스). 2차: 메신저가 긴 코드를 줄바꿈/공백으로
// 감싼 경우를 대비해 공백 제거 후 재시도.
export function decodeTapeShare(text: string): Tape | null {
  const strict = text.match(/CT2:([A-Za-z0-9+/=]+)/)?.[1];
  const loose = text.match(/CT2:\s*([A-Za-z0-9+/=\s]+)/)?.[1]?.replace(/\s+/g, "");
  for (const candidate of [strict, loose]) {
    if (!candidate) continue;
    const tape = tapeFromBase64(candidate);
    if (tape) return tape;
  }
  return null;
}
