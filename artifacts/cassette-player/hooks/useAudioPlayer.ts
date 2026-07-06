import AsyncStorage from "@react-native-async-storage/async-storage";
import { Audio, AVPlaybackStatus } from "expo-av";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Platform } from "react-native";
import { acquireWakeLock, releaseWakeLock, startForegroundService, stopForegroundService } from "@/utils/wakeLock";

// Android Doze 방지용 재생 알림 (Foreground Service 유지)
const PLAYBACK_NOTIFICATION_ID = "cassette-playback";

async function setupNotificationChannel() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.setNotificationChannelAsync("playback", {
      name: "재생 중",
      importance: Notifications.AndroidImportance.LOW,
      showBadge: false,
      sound: null,
      vibrationPattern: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    });
    // 재생 중 카테고리: ⏸ 일시정지 + ⏭ 다음
    await Notifications.setNotificationCategoryAsync("playing", [
      { identifier: "pause", buttonTitle: "⏸", options: { opensAppToForeground: false } },
      { identifier: "next",  buttonTitle: "⏭", options: { opensAppToForeground: false } },
    ]);
    // 일시정지 카테고리: ▶ 재생 + ⏭ 다음
    await Notifications.setNotificationCategoryAsync("paused", [
      { identifier: "play", buttonTitle: "▶", options: { opensAppToForeground: false } },
      { identifier: "next",  buttonTitle: "⏭", options: { opensAppToForeground: false } },
    ]);
  } catch {}
}

async function showPlaybackNotification(title: string) {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PLAYBACK_NOTIFICATION_ID,
      content: {
        title: "Cassette Player 2",
        body: title || "재생 중...",
        sticky: true,
        autoDismiss: false,
        categoryIdentifier: "playing",
        data: {},
      },
      trigger: null,
    });
  } catch {}
}

async function updatePlaybackNotification(title: string, isPlaying: boolean) {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier: PLAYBACK_NOTIFICATION_ID,
      content: {
        title: "Cassette Player 2",
        body: title || "",
        sticky: true,
        autoDismiss: false,
        categoryIdentifier: isPlaying ? "playing" : "paused",
        data: {},
      },
      trigger: null,
    });
  } catch {}
}

async function dismissPlaybackNotification() {
  if (Platform.OS !== "android") return;
  try {
    await Notifications.dismissNotificationAsync(PLAYBACK_NOTIFICATION_ID);
  } catch {}
}

export type Side = "A" | "B";

export type TrackSourceType = "local" | "stream" | "youtube";

export interface TrackItem {
  id: string;
  type: "track";
  title: string;
  duration: number;
  uri: string;
  sourceType?: TrackSourceType;
  youtubeId?: string;
}

export interface NoiseItem {
  id: string;
  type: "noise";
  duration: number;
}

export type SideItem = TrackItem | NoiseItem;

// 카세트 테이프 한 개 = Side A/B 곡 목록을 가진 플레이리스트
export interface Tape {
  id: string;
  name: string;
  sideA: SideItem[];
  sideB: SideItem[];
  createdAt: number;
  updatedAt: number;
  sharedFrom?: string; // 공유받은 테이프의 원래 이름 (있으면 표시용)
}

export const MAX_SIDE_MS = 30 * 60 * 1000;
export const DEFAULT_NOISE_MS = 2000;

// v1 (단일 테이프) 시절 키 — 최초 실행 시 테이프 컬렉션으로 마이그레이션
const KEY_A = "@cassette_items_A_v1";
const KEY_B = "@cassette_items_B_v1";
const KEY_SIDE = "@cassette_side_v1";
const KEY_TAPES = "@cassette2_tapes_v1";
const KEY_CURRENT_TAPE = "@cassette2_current_tape_v1";

function findItemAtTapePosition(items: SideItem[], targetMs: number): { itemIdx: number; offsetMs: number } {
  let elapsed = 0;
  for (let i = 0; i < items.length; i++) {
    const dur = items[i].duration;
    if (elapsed + dur > targetMs) {
      // track이든 noise든 동일하게 해당 아이템의 offset 반환
      return { itemIdx: i, offsetMs: targetMs - elapsed };
    }
    elapsed += dur;
  }
  // targetMs가 콘텐츠 범위 초과 → 첫 번째 트랙부터 재생
  const firstTrack = items.findIndex((it) => it.type === "track");
  return firstTrack !== -1 ? { itemIdx: firstTrack, offsetMs: 0 } : { itemIdx: 0, offsetMs: 0 };
}

function genId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

// YouTube URL에서 videoId 추출
export function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:watch\?.*v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

// YouTube oEmbed API로 제목 조회 (API key 불필요)
async function fetchYouTubeTitle(videoId: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      return typeof data.title === "string" ? data.title : null;
    }
  } catch {}
  return null;
}

function createEmptyTape(name: string): Tape {
  const now = Date.now();
  return { id: genId("tape"), name, sideA: [], sideB: [], createdAt: now, updatedAt: now };
}
function trackId(uri: string) {
  return `track_${uri.replace(/[^a-zA-Z0-9]/g, "").slice(-24)}`;
}
function totalMs(items: SideItem[]) {
  return items.reduce((s, i) => s + i.duration, 0);
}

async function loadFileDuration(uri: string): Promise<number> {
  return new Promise<number>((resolve) => {
    const timer = setTimeout(() => resolve(0), 10000);
    (async () => {
      try {
        const { sound, status } = await Audio.Sound.createAsync(
          { uri },
          { shouldPlay: false }
        );
        let dur = 0;
        if (status.isLoaded && status.durationMillis) {
          dur = status.durationMillis;
        } else {
          await new Promise((r) => setTimeout(r, 600));
          const s2 = await sound.getStatusAsync();
          if (s2.isLoaded && s2.durationMillis) dur = s2.durationMillis;
        }
        await sound.unloadAsync().catch(() => {});
        clearTimeout(timer);
        resolve(dur);
      } catch {
        clearTimeout(timer);
        resolve(0);
      }
    })();
  });
}

export interface UseAudioPlayerReturn {
  sideA: SideItem[];
  sideB: SideItem[];
  currentSide: Side;
  currentItemIdx: number;
  currentTrack: TrackItem | null;
  isPlaying: boolean;
  isPlayingNoise: boolean;
  isFastForward: boolean;
  isRewind: boolean;
  isLoading: boolean;
  isAdding: boolean;
  position: number;
  duration: number;
  progress: number;
  tapePosition: number;
  togglePlayPause: () => Promise<void>;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stopPlayback: () => Promise<void>;
  playNext: () => Promise<void>;
  playPrevious: () => Promise<void>;
  playItemAt: (idx: number) => Promise<void>;
  seekTo: (ms: number) => Promise<void>;
  seekForward: (s?: number) => Promise<void>;
  seekBackward: (s?: number) => Promise<void>;
  startFastForward: () => Promise<void>;
  stopFastForward: () => Promise<void>;
  startRewind: () => Promise<void>;
  stopRewind: () => Promise<void>;
  flipSide: (tapePositionMs?: number) => Promise<void>;
  addToSide: (side: Side) => Promise<void>;
  addUrlToSide: (url: string, side: Side, customTitle?: string) => Promise<void>;
  removeTrackItem: (side: Side, trackId: string) => void;
  updateNoiseDuration: (side: Side, noiseId: string, ms: number) => void;
  setSide: (side: Side) => void;
  // YouTube 재생 (player.tsx의 iframe과 연동)
  currentYoutubeId: string | null;
  youtubePlaying: boolean;
  onYoutubeStateChange: (state: string) => void;
  // 테이프 컬렉션
  tapes: Tape[];
  currentTapeId: string | null;
  currentTapeName: string;
  createTape: (name: string) => void;
  selectTape: (id: string) => Promise<void>;
  renameTape: (id: string, name: string) => void;
  deleteTape: (id: string) => Promise<void>;
  importTape: (tape: Tape) => void;
}

export function useAudioPlayer(): UseAudioPlayerReturn {
  const [sideA, setSideA] = useState<SideItem[]>([]);
  const [sideB, setSideB] = useState<SideItem[]>([]);
  const [currentSide, setCurrentSide] = useState<Side>("A");
  const [currentItemIdx, setCurrentItemIdx] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPlayingNoise, setIsPlayingNoise] = useState(false);
  const [isFastForward, setIsFastForward] = useState(false);
  const [isRewind, setIsRewind] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [tapePosition, setTapePosition] = useState(0);
  const [currentYoutubeId, setCurrentYoutubeId] = useState<string | null>(null);
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [tapes, setTapes] = useState<Tape[]>([]);
  const [currentTapeId, setCurrentTapeId] = useState<string | null>(null);
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  const tapePositionRef = useRef(0); // 노이즈 포함 항상 최신 테이프 위치 추적
  const noiseCancelRef = useRef(false); // FF/REW 시작 시 진행 중인 노이즈만 취소 (cancelRef 오염 방지)
  const isSeekingRef = useRef(false);
  const noiseTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // 백그라운드 트랙 전환 복구용: 재생 의도 상태 추적
  // (soundRef가 null인 전환 도중 JS가 중단됐을 때 AppState 복구에 사용)
  const wasPlayingRef = useRef(false);
  // 트랙 자연 종료 여부: didJustFinish 시 true, playItemAt 시작 시 false
  // AppState 복구 시 advance()와 resume() 구분에 사용
  const trackEndedRef = useRef(false);

  const soundRef = useRef<Audio.Sound | null>(null);
  const noiseRef = useRef<Audio.Sound | null>(null);
  const itemIdxRef = useRef(-1);
  const sideRef = useRef<Side>("A");
  const sideARef = useRef<SideItem[]>([]);
  const sideBRef = useRef<SideItem[]>([]);
  const cancelRef = useRef(false);
  const youtubeIdRef = useRef<string | null>(null);
  const youtubeTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tapesRef = useRef<Tape[]>([]);
  const currentTapeIdRef = useRef<string | null>(null);

  useEffect(() => { itemIdxRef.current = currentItemIdx; }, [currentItemIdx]);
  useEffect(() => { sideRef.current = currentSide; }, [currentSide]);
  useEffect(() => { sideARef.current = sideA; }, [sideA]);
  useEffect(() => { sideBRef.current = sideB; }, [sideB]);
  useEffect(() => { youtubeIdRef.current = currentYoutubeId; }, [currentYoutubeId]);
  useEffect(() => { tapesRef.current = tapes; }, [tapes]);
  useEffect(() => { currentTapeIdRef.current = currentTapeId; }, [currentTapeId]);

  const getItems = useCallback((side: Side): SideItem[] =>
    side === "A" ? sideARef.current : sideBRef.current, []);

  // 아이템 배열 + 현재 인덱스 + 트랙 내 위치로 테이프 위치(ms) 계산
  const computeTapePos = useCallback((side: Side, itemIdx: number, trackPos: number): number => {
    const items = side === "A" ? sideARef.current : sideBRef.current;
    if (itemIdx < 0 || itemIdx >= items.length) return 0;
    return items.slice(0, itemIdx).reduce((s, it) => s + it.duration, 0) + trackPos;
  }, []);

  // 노이즈 재생 시 테이프 위치를 실시간으로 업데이트 (UI 표시 전용)
  const startNoiseTick = useCallback((baseTapePos: number) => {
    if (noiseTickRef.current) clearInterval(noiseTickRef.current);
    const startedAt = Date.now();
    tapePositionRef.current = baseTapePos;
    setTapePosition(baseTapePos);
    noiseTickRef.current = setInterval(() => {
      const next = Math.min(baseTapePos + (Date.now() - startedAt), MAX_SIDE_MS);
      tapePositionRef.current = next;
      setTapePosition(next);
    }, 250);
  }, []);

  const stopNoiseTick = useCallback(() => {
    if (noiseTickRef.current) { clearInterval(noiseTickRef.current); noiseTickRef.current = null; }
  }, []);

  // YouTube 재생 중 테이프 위치 실시간 업데이트 (iframe이 position 콜백을 안 주므로 경과시간 기반)
  const startYoutubeTick = useCallback((baseTapePos: number) => {
    if (youtubeTickRef.current) clearInterval(youtubeTickRef.current);
    const startedAt = Date.now();
    tapePositionRef.current = baseTapePos;
    setTapePosition(baseTapePos);
    youtubeTickRef.current = setInterval(() => {
      if (cancelRef.current) return;
      const elapsed = Date.now() - startedAt;
      const next = Math.min(baseTapePos + elapsed, MAX_SIDE_MS);
      tapePositionRef.current = next;
      setTapePosition(next);
      setPosition(elapsed);
    }, 250);
  }, []);

  const stopYoutubeTick = useCallback(() => {
    if (youtubeTickRef.current) { clearInterval(youtubeTickRef.current); youtubeTickRef.current = null; }
  }, []);

  const persistTapes = useCallback((next: Tape[]) => {
    tapesRef.current = next;
    setTapes(next);
    AsyncStorage.setItem(KEY_TAPES, JSON.stringify(next));
  }, []);

  // 데크(side A/B) 변경을 현재 테이프에도 반영하여 저장
  const saveItems = useCallback((side: Side, items: SideItem[]) => {
    if (side === "A") { setSideA(items); sideARef.current = items; }
    else { setSideB(items); sideBRef.current = items; }
    const tid = currentTapeIdRef.current;
    if (!tid) return;
    persistTapes(tapesRef.current.map((t) =>
      t.id === tid
        ? { ...t, [side === "A" ? "sideA" : "sideB"]: items, updatedAt: Date.now() }
        : t
    ));
  }, [persistTapes]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });
    // Android Doze 방지 알림 채널 설정 + 권한 요청
    setupNotificationChannel();
    Notifications.requestPermissionsAsync().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      const [tapesRaw, curId, a, b, side] = await Promise.all([
        AsyncStorage.getItem(KEY_TAPES), AsyncStorage.getItem(KEY_CURRENT_TAPE),
        AsyncStorage.getItem(KEY_A), AsyncStorage.getItem(KEY_B), AsyncStorage.getItem(KEY_SIDE),
      ]);

      let loadedTapes: Tape[] = [];
      try { if (tapesRaw) loadedTapes = JSON.parse(tapesRaw); } catch {}

      if (loadedTapes.length === 0) {
        // 마이그레이션: v1 단일 테이프 데이터(KEY_A/KEY_B)를 첫 테이프로 변환
        const legacy = createEmptyTape("MY TAPE 01");
        try { if (a) legacy.sideA = JSON.parse(a); } catch {}
        try { if (b) legacy.sideB = JSON.parse(b); } catch {}
        loadedTapes = [legacy];
        AsyncStorage.setItem(KEY_TAPES, JSON.stringify(loadedTapes));
      }

      const current = loadedTapes.find((t) => t.id === curId) ?? loadedTapes[0];
      tapesRef.current = loadedTapes;
      setTapes(loadedTapes);
      currentTapeIdRef.current = current.id;
      setCurrentTapeId(current.id);
      AsyncStorage.setItem(KEY_CURRENT_TAPE, current.id);

      sideARef.current = current.sideA;
      sideBRef.current = current.sideB;
      setSideA(current.sideA);
      setSideB(current.sideB);
      if (side === "A" || side === "B") setCurrentSide(side as Side);
    })();
    return () => { soundRef.current?.unloadAsync(); noiseRef.current?.unloadAsync(); };
  }, []);

  const stopTrack = async () => {
    if (soundRef.current) {
      try { await soundRef.current.stopAsync(); await soundRef.current.unloadAsync(); } catch {}
      soundRef.current = null;
    }
  };

  const stopNoise = async () => {
    if (noiseRef.current) {
      try { await noiseRef.current.stopAsync(); await noiseRef.current.unloadAsync(); } catch {}
      noiseRef.current = null;
    }
  };

  const cancelAll = useCallback(async () => {
    cancelRef.current = true;
    wasPlayingRef.current = false;
    trackEndedRef.current = false;
    releaseWakeLock();
    stopYoutubeTick();
    youtubeIdRef.current = null;
    setCurrentYoutubeId(null);
    setYoutubePlaying(false);
    await Promise.all([stopTrack(), stopNoise()]);
    setIsPlaying(false);
    setIsPlayingNoise(false);
    setPosition(0);
    setDuration(0);
    stopForegroundService();
  }, [stopYoutubeTick]);

  // tape-noise.wav 길이 (7.92s). seekMs = NOISE_FILE_MS - durationMs 위치에서
  // 시작하면 durationMs 후 didJustFinish가 자연 발생 → setTimeout 불필요
  const NOISE_FILE_MS = 7900;

  const playNoiseDuration = (durationMs: number): Promise<boolean> => {
    if (cancelRef.current) return Promise.resolve(false);
    if (durationMs <= 0) return Promise.resolve(!cancelRef.current);

    const playMs = Math.min(durationMs, NOISE_FILE_MS);
    const seekMs = Math.max(0, NOISE_FILE_MS - playMs);

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const settle = (val: boolean) => { if (!settled) { settled = true; resolve(val); } };

      // 외부 취소 감지 (pause 버튼, FF/REW 시작 등) — 타이머 스로틀링 영향을 받아도 무관
      const cancelWatcher = setInterval(() => {
        if (cancelRef.current || noiseCancelRef.current) { clearInterval(cancelWatcher); settle(false); }
      }, 150);

      (async () => {
        try {
          await stopNoise();
          if (cancelRef.current) { clearInterval(cancelWatcher); settle(false); return; }

          const { sound } = await Audio.Sound.createAsync(
            require("../assets/sounds/tape-noise.wav"),
            { shouldPlay: false, volume: 0.45 },
            (status) => {
              if (!status.isLoaded) return;
              if (status.didJustFinish) {           // 오디오 시스템 콜백 — 백그라운드 안전
                clearInterval(cancelWatcher);
                sound.unloadAsync().catch(() => {});
                noiseRef.current = null;
                settle(!cancelRef.current);
              }
            }
          );
          noiseRef.current = sound;

          if (cancelRef.current) {
            clearInterval(cancelWatcher);
            await sound.unloadAsync().catch(() => {});
            noiseRef.current = null;
            settle(false);
            return;
          }
          if (seekMs > 0) await sound.setPositionAsync(seekMs);
          await sound.playAsync();
        } catch {
          clearInterval(cancelWatcher);
          noiseRef.current = null;
          settle(!cancelRef.current);
        }
      })();
    });
  };

  const playItemAtRef = useRef<((idx: number, initialPositionMs?: number) => Promise<void>) | null>(null);

  const flipSideRef = useRef<((tapePositionMs?: number) => Promise<void>) | null>(null);
  const isFlippingRef = useRef(false);

  const advance = useCallback(() => {
    if (cancelRef.current || isFlippingRef.current) return;
    setIsPlaying(true); // 트랙 전환 중 버튼 ▶ 깜빡임 방지 (React 배치로 false→true 한 번에 처리)
    const items = getItems(sideRef.current);
    const next = itemIdxRef.current + 1;
    if (next >= items.length) {
      const used = totalMs(items);
      const fillMs = MAX_SIDE_MS - used;
      if (fillMs > 1000) {
        setCurrentItemIdx(-1);
        itemIdxRef.current = -1;
        setIsPlayingNoise(true);
        setIsPlaying(true);
        wasPlayingRef.current = true;
        acquireWakeLock();
        startNoiseTick(used); // fill noise는 콘텐츠 총합 위치에서 시작
        playNoiseDuration(fillMs).then((done) => {
          stopNoiseTick();
          setIsPlayingNoise(false);
          if (done) {
            // 테이프 끝 → 반대 사이드 처음부터 자동 재생
            flipSideRef.current?.(MAX_SIDE_MS);
          }
        });
      } else {
        // 짧은 gap → 바로 반대 사이드 처음부터 자동 재생
        flipSideRef.current?.(MAX_SIDE_MS);
      }
      return;
    }
    playItemAtRef.current?.(next);
  }, [getItems, startNoiseTick, stopNoiseTick]);

  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    positionRef.current = status.positionMillis;
    durationRef.current = status.durationMillis ?? 0;
    setPosition(status.positionMillis);
    setDuration(status.durationMillis ?? 0);
    // 트랙 재생 중 테이프 위치 업데이트
    const tp = computeTapePos(sideRef.current, itemIdxRef.current, status.positionMillis);
    tapePositionRef.current = tp;
    setTapePosition(tp);
    // seek 중에는 isPlaying 업데이트 생략 (FF/RW 시 Play/Pause 버튼 flickering 방지)
    if (!isSeekingRef.current) setIsPlaying(status.isPlaying);
    if (status.didJustFinish && !cancelRef.current) {
      trackEndedRef.current = true;
      advance();
    }
  }, [advance, computeTapePos]);

  const playItemAt = useCallback(async (idx: number, initialPositionMs?: number) => {
    if (cancelRef.current) return;
    const items = getItems(sideRef.current);
    if (idx < 0 || idx >= items.length) return;
    const item = items[idx];
    trackEndedRef.current = false; // 새 트랙 시작 → 종료 플래그 초기화
    setCurrentItemIdx(idx);
    itemIdxRef.current = idx;

    if (item.type === "noise") {
      setIsPlayingNoise(true);
      setIsPlaying(true);
      wasPlayingRef.current = true;
      acquireWakeLock();
      setPosition(0);
      setDuration(item.duration);
      // 노이즈 시작 테이프 위치 = 앞 아이템 총합 + offset
      startNoiseTick(computeTapePos(sideRef.current, idx, initialPositionMs ?? 0));
      // 플립으로 noise 중간에 진입한 경우 남은 시간만 재생
      const remainingMs = initialPositionMs ? Math.max(0, item.duration - initialPositionMs) : item.duration;
      const done = await playNoiseDuration(remainingMs);
      stopNoiseTick();
      setIsPlayingNoise(false);
      if (done) advance();
    } else if (item.sourceType === "youtube" && item.youtubeId) {
      // YouTube 트랙: expo-av 대신 player 화면의 YouTube iframe으로 재생
      setIsPlayingNoise(false);
      setIsLoading(false);
      setPosition(0);
      setDuration(item.duration || 0);
      await stopTrack();
      if (cancelRef.current) return;
      youtubeIdRef.current = item.youtubeId;
      setCurrentYoutubeId(item.youtubeId);
      setYoutubePlaying(true);
      setIsPlaying(true);
      wasPlayingRef.current = true;
      acquireWakeLock();
      const baseTapePos = computeTapePos(sideRef.current, idx, initialPositionMs ?? 0);
      startYoutubeTick(baseTapePos);
      startForegroundService(item.title);
    } else {
      setIsPlayingNoise(false);
      setIsLoading(true);
      setPosition(0);
      setDuration(0);
      // YouTube 트랙에서 일반 트랙으로 전환 시 정리
      stopYoutubeTick();
      youtubeIdRef.current = null;
      setCurrentYoutubeId(null);
      setYoutubePlaying(false);
      try {
        await stopTrack();
        if (cancelRef.current) return;
        const startPos = initialPositionMs ?? 0;
        // shouldPlay:true + positionMillis 로 원자적 seek-and-play
        // (play 시작 후 위치 확인하여 seek이 안 됐으면 보정)
        const { sound } = await Audio.Sound.createAsync(
          { uri: item.uri },
          { shouldPlay: true, positionMillis: startPos },
          onPlaybackStatusUpdate
        );
        soundRef.current = sound;
        if (cancelRef.current) {
          await sound.stopAsync().catch(() => {});
          await sound.unloadAsync().catch(() => {});
          soundRef.current = null;
          return;
        }
        // positionMillis가 기기에서 적용 안 됐으면 명시적 seek 보정
        if (startPos > 0) {
          const st = await sound.getStatusAsync();
          if (st.isLoaded && (st.positionMillis ?? 0) < startPos - 500) {
            await sound.setPositionAsync(startPos);
          }
        }
        setIsPlaying(true);
        wasPlayingRef.current = true;
        acquireWakeLock();
        // Foreground Service 시작 (Android Doze 완전 제외)
        startForegroundService(item.title);
      } catch (err) {
        console.warn("playItemAt error:", err);
        if (!cancelRef.current) advance();
      }
      setIsLoading(false);
    }
  }, [getItems, advance, onPlaybackStatusUpdate, computeTapePos, startNoiseTick, stopNoiseTick, startYoutubeTick, stopYoutubeTick]);

  useEffect(() => { playItemAtRef.current = playItemAt; }, [playItemAt]);

  // 화면 꺼짐 후 복귀 시 트랙 전환 복구
  useEffect(() => {
    const subscription = AppState.addEventListener("change", async (nextState) => {
      if (nextState !== "active" || cancelRef.current || isFlippingRef.current) return;
      // 명시적으로 정지된 상태(pause/stop)면 복구 불필요
      if (!wasPlayingRef.current) return;
      // YouTube 재생 중이면 iframe이 자체 관리 → 복구 로직 제외
      if (youtubeIdRef.current) return;

      if (soundRef.current) {
        // Case A: 사운드가 로드됐지만 재생 중이 아님
        try {
          const status = await soundRef.current.getStatusAsync();
          if (status.isLoaded && !status.isPlaying) {
            if (trackEndedRef.current) {
              // didJustFinish가 발생했지만 advance()가 미완료 상태 (WakeLock 실패 등)
              trackEndedRef.current = false;
              advance();
            } else {
              // 오디오 포커스 손실(알림, 전화 등)로 인한 일시정지 → 재개
              try {
                await soundRef.current.playAsync();
                setIsPlaying(true);
                acquireWakeLock();
              } catch {
                // 재개 실패 시 현재 아이템 다시 로드
                const items = getItems(sideRef.current);
                if (items.length > 0) {
                  cancelRef.current = false;
                  const idx = itemIdxRef.current >= 0 && itemIdxRef.current < items.length
                    ? itemIdxRef.current : 0;
                  playItemAtRef.current?.(idx);
                }
              }
            }
          }
        } catch {
          // getStatusAsync 실패(이미 unload됨) → advance 시도
          advance();
        }
      } else if (noiseRef.current === null) {
        // Case B: 사운드도 노이즈도 없음 — stopTrack() 후 createAsync() 미완료 상태
        const items = getItems(sideRef.current);
        if (items.length > 0) {
          cancelRef.current = false;
          const idx = itemIdxRef.current >= 0 && itemIdxRef.current < items.length
            ? itemIdxRef.current
            : 0;
          playItemAtRef.current?.(idx);
        }
      }
    });
    return () => subscription.remove();
  }, [advance, getItems]);

  const play = useCallback(async () => {
    if (isPlayingNoise) return;
    if (isPlaying) return;
    // YouTube 트랙 재개
    if (currentYoutubeId) {
      cancelRef.current = false;
      setYoutubePlaying(true);
      setIsPlaying(true);
      wasPlayingRef.current = true;
      acquireWakeLock();
      startYoutubeTick(tapePositionRef.current);
      return;
    }
    playClickSound();
    await new Promise<void>((r) => setTimeout(r, 60));
    if (soundRef.current) {
      cancelRef.current = false;
      await soundRef.current.playAsync();
      setIsPlaying(true);
    } else {
      const items = getItems(sideRef.current);
      if (!items.length) return;
      cancelRef.current = false;
      await playItemAtRef.current?.(0);
    }
  }, [isPlaying, isPlayingNoise, currentYoutubeId, getItems, startYoutubeTick]);

  const pause = useCallback(async () => {
    wasPlayingRef.current = false;
    trackEndedRef.current = false;
    releaseWakeLock();
    // YouTube 트랙 일시정지
    if (currentYoutubeId) {
      stopYoutubeTick();
      setYoutubePlaying(false);
      setIsPlaying(false);
      stopForegroundService();
      return;
    }
    if (isPlayingNoise) {
      cancelRef.current = true;
      await stopNoise();
      setIsPlayingNoise(false);
      setIsPlaying(false);
      dismissPlaybackNotification();
      return;
    }
    if (!isPlaying) return;
    await soundRef.current?.pauseAsync();
    setIsPlaying(false);
  }, [isPlaying, isPlayingNoise, currentYoutubeId, getItems, stopYoutubeTick]);

  const stopPlayback = useCallback(async () => {
    await cancelAll();
    setCurrentItemIdx(-1);
    itemIdxRef.current = -1;
  }, [cancelAll]);

  const togglePlayPause = useCallback(async () => {
    if (isPlaying || isPlayingNoise) await pause();
    else await play();
  }, [isPlaying, isPlayingNoise, play, pause]);

  const findNextTrack = (items: SideItem[], from: number) => {
    for (let i = from + 1; i < items.length; i++)
      if (items[i].type === "track") return i;
    return -1;
  };
  const findPrevTrack = (items: SideItem[], from: number) => {
    for (let i = from - 1; i >= 0; i--)
      if (items[i].type === "track") return i;
    return -1;
  };

  const playNext = useCallback(async () => {
    const items = getItems(sideRef.current);
    const nextTrackIdx = findNextTrack(items, itemIdxRef.current);
    if (nextTrackIdx === -1) return;
    const startIdx =
      nextTrackIdx > 0 && items[nextTrackIdx - 1].type === "noise"
        ? nextTrackIdx - 1
        : nextTrackIdx;
    await cancelAll();
    cancelRef.current = false;
    await playItemAtRef.current?.(startIdx);
  }, [getItems, cancelAll]);

  const playPrevious = useCallback(async () => {
    if (position > 3000 && soundRef.current) {
      await soundRef.current.setPositionAsync(0);
      return;
    }
    const items = getItems(sideRef.current);
    const cur = itemIdxRef.current;
    const curItem = items[cur];
    const fromIdx = !curItem || curItem.type === "noise"
      ? findPrevTrack(items, cur)
      : findPrevTrack(items, cur);
    if (fromIdx === -1) return;
    const startIdx =
      fromIdx > 0 && items[fromIdx - 1].type === "noise"
        ? fromIdx - 1
        : fromIdx;
    await cancelAll();
    cancelRef.current = false;
    await playItemAtRef.current?.(startIdx);
  }, [position, getItems, cancelAll]);

  const seekTo = useCallback(async (ms: number) => {
    if (isSeekingRef.current) return;
    isSeekingRef.current = true;
    try { await soundRef.current?.setPositionAsync(ms); } finally { isSeekingRef.current = false; }
  }, []);
  const seekForward = useCallback(async (s = 10) => {
    if (isSeekingRef.current || !soundRef.current) return;
    isSeekingRef.current = true;
    try {
      await soundRef.current.setPositionAsync(
        Math.min(positionRef.current + s * 1000, durationRef.current)
      );
    } finally { isSeekingRef.current = false; }
  }, []);
  const seekBackward = useCallback(async (s = 10) => {
    if (isSeekingRef.current || !soundRef.current) return;
    isSeekingRef.current = true;
    try {
      await soundRef.current.setPositionAsync(
        Math.max(0, positionRef.current - s * 1000)
      );
    } finally { isSeekingRef.current = false; }
  }, []);

  // FF 전용 사운드 및 스크럽 상태 (REW와 동일한 절대 테이프 위치 방식)
  const ffSoundRef = useRef<Audio.Sound | null>(null);
  const ffScrubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ffActiveRef = useRef(false);
  const ffTapePosRef = useRef(0); // FF 중 절대 테이프 위치 추적

  const startFastForward = useCallback(async () => {
    if (ffActiveRef.current) return;
    ffActiveRef.current = true;
    setIsFastForward(true);
    // 노이즈 재생 중이면 먼저 중단 (cancelRef 오염 없이 noiseCancelRef 사용)
    if (noiseRef.current) {
      noiseCancelRef.current = true;
      await stopNoise();
      stopNoiseTick();
      setIsPlayingNoise(false);
      noiseCancelRef.current = false;
    }
    // YouTube 재생 중이면 iframe 일시정지 (위치 이동 후 playItemAt이 다시 처리)
    if (youtubeIdRef.current) {
      stopYoutubeTick();
      setYoutubePlaying(false);
    }
    // 현재 절대 테이프 위치 캡처 (노이즈 중에도 tapePositionRef 사용)
    ffTapePosRef.current = tapePositionRef.current;
    // 오디오 일시정지
    try { await soundRef.current?.pauseAsync(); } catch {}
    // FF 사운드 루프 재생
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/tape-ff.wav"),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      ffSoundRef.current = sound;
    } catch {}
    // 테이프 위치를 10배속으로 앞으로 이동 (트랙 경계 넘어 계속 진행)
    ffScrubIntervalRef.current = setInterval(() => {
      if (!ffActiveRef.current) return;
      const next = Math.min(ffTapePosRef.current + 1000, MAX_SIDE_MS);
      ffTapePosRef.current = next;
      setTapePosition(next);
    }, 100);
  }, [isPlayingNoise, computeTapePos]);

  const stopFastForward = useCallback(async () => {
    if (!ffActiveRef.current) return;
    ffActiveRef.current = false;
    setIsFastForward(false);
    if (ffScrubIntervalRef.current) {
      clearInterval(ffScrubIntervalRef.current);
      ffScrubIntervalRef.current = null;
    }
    // FF 사운드 정지
    if (ffSoundRef.current) {
      try { await ffSoundRef.current.stopAsync(); await ffSoundRef.current.unloadAsync(); } catch {}
      ffSoundRef.current = null;
    }
    // 딸깍 소리 후 재생 시작 (부드러운 전환)
    const targetMs = ffTapePosRef.current;
    const items = getItems(sideRef.current);
    cancelRef.current = false;
    if (items.length === 0) { setIsPlaying(false); return; }
    tapePositionRef.current = targetMs;
    setTapePosition(targetMs);
    playClickSound();
    await new Promise<void>((r) => setTimeout(r, 60));
    const { itemIdx, offsetMs } = findItemAtTapePosition(items, targetMs);
    await playItemAtRef.current?.(itemIdx, offsetMs);
  }, [getItems]);

  // REW 전용 사운드 및 스크럽 상태
  const rwSoundRef = useRef<Audio.Sound | null>(null);
  const rwScrubIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rwActiveRef = useRef(false);
  const rwTapePosRef = useRef(0); // REW 중 절대 테이프 위치 추적

  const startRewind = useCallback(async () => {
    if (rwActiveRef.current) return;
    rwActiveRef.current = true;
    setIsRewind(true);
    // 노이즈 재생 중이면 먼저 중단 (cancelRef 오염 없이 noiseCancelRef 사용)
    if (noiseRef.current) {
      noiseCancelRef.current = true;
      await stopNoise();
      stopNoiseTick();
      setIsPlayingNoise(false);
      noiseCancelRef.current = false;
    }
    // YouTube 재생 중이면 iframe 일시정지 (위치 이동 후 playItemAt이 다시 처리)
    if (youtubeIdRef.current) {
      stopYoutubeTick();
      setYoutubePlaying(false);
    }
    // 현재 절대 테이프 위치 캡처 (노이즈 중에도 tapePositionRef 사용)
    rwTapePosRef.current = tapePositionRef.current;
    // 오디오 일시정지
    try { await soundRef.current?.pauseAsync(); } catch {}
    // 테이프 되감기 사운드 루프 재생
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/tape-ff.wav"),
        { shouldPlay: true, isLooping: true, volume: 1.0 }
      );
      rwSoundRef.current = sound;
    } catch {}
    // 테이프 위치를 10배속으로 뒤로 이동
    rwScrubIntervalRef.current = setInterval(() => {
      if (!rwActiveRef.current) return;
      const next = Math.max(0, rwTapePosRef.current - 1000);
      rwTapePosRef.current = next;
      setTapePosition(next);
    }, 100);
  }, [isPlayingNoise, computeTapePos]);

  const stopRewind = useCallback(async () => {
    if (!rwActiveRef.current) return;
    rwActiveRef.current = false;
    setIsRewind(false);
    if (rwScrubIntervalRef.current) {
      clearInterval(rwScrubIntervalRef.current);
      rwScrubIntervalRef.current = null;
    }
    // 테이프 사운드 정지
    if (rwSoundRef.current) {
      try { await rwSoundRef.current.stopAsync(); await rwSoundRef.current.unloadAsync(); } catch {}
      rwSoundRef.current = null;
    }
    // 딸깍 소리 후 재생 시작 (부드러운 전환)
    const targetMs = rwTapePosRef.current;
    const items = getItems(sideRef.current);
    cancelRef.current = false;
    if (items.length === 0) { setIsPlaying(false); return; }
    tapePositionRef.current = targetMs;
    setTapePosition(targetMs);
    playClickSound();
    await new Promise<void>((r) => setTimeout(r, 60));
    const { itemIdx, offsetMs } = findItemAtTapePosition(items, targetMs);
    await playItemAtRef.current?.(itemIdx, offsetMs);
  }, [getItems]);

  // 딸깍 소리: play 시작 / FF·REW 해제 후 재생 복귀 시 재생 (flip 사운드 짧게 사용)
  const playClickSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/tape-flip.wav"),
        { shouldPlay: true, volume: 1.0 }
      );
      setTimeout(async () => {
        await sound.stopAsync().catch(() => {});
        await sound.unloadAsync().catch(() => {});
      }, 200);
    } catch {}
  };

  const playFlipSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require("../assets/sounds/tape-flip.wav"),
        { shouldPlay: true, volume: 0.9 }
      );
      await new Promise<void>((r) => setTimeout(r, 600));
      await sound.stopAsync().catch(() => {});
      await sound.unloadAsync().catch(() => {});
    } catch {}
  };

  const flipSide = useCallback(async (sourceTapePositionMs: number = 0) => {
    if (isFlippingRef.current) return;
    isFlippingRef.current = true;
    await cancelAll();
    cancelRef.current = false;

    // 사이드 표시를 즉시 변경 → 플립 애니메이션과 동기화 (사운드/노이즈 기다리지 않음)
    const newSide: Side = sideRef.current === "A" ? "B" : "A";
    setCurrentSide(newSide);
    sideRef.current = newSide;
    AsyncStorage.setItem(KEY_SIDE, newSide);

    // 진행바를 목표 위치로 즉시 설정 (cancelAll 후 0으로 깜빡이는 것 방지)
    const targetMsImmediate = Math.max(0, MAX_SIDE_MS - sourceTapePositionMs);
    setTapePosition(targetMsImmediate);

    setIsPlayingNoise(true);
    setIsPlaying(true);
    let shouldFlipBack = false;
    try {
      await playFlipSound();
      setIsPlayingNoise(false);
      setCurrentItemIdx(-1);
      itemIdxRef.current = -1;
      const newItems = getItems(newSide); // newSide already set above
      cancelRef.current = false;
      // targetMs: 반대 사이드 테이프 기준 재생 시작 위치 (물리적 테이프 위치 보존)
      const targetMs = Math.max(0, MAX_SIDE_MS - sourceTapePositionMs);
      const totalContent = totalMs(newItems);

      if (newItems.length === 0 || targetMs >= totalContent) {
        // 트랙 없음 또는 flip 위치가 trailing fill zone → 남은 테이프 시간만큼 노이즈
        const fillMs = MAX_SIDE_MS - targetMs;
        if (fillMs > 500) {
          setIsPlayingNoise(true);
          setIsPlaying(true);
          startNoiseTick(targetMs); // 새 사이드의 targetMs 위치에서 노이즈 시작
          const fillDone = await playNoiseDuration(fillMs);
          stopNoiseTick();
          setIsPlayingNoise(false);
          if (fillDone) shouldFlipBack = true;
        } else {
          setIsPlaying(false);
        }
      } else {
        const { itemIdx, offsetMs } = findItemAtTapePosition(newItems, targetMs);
        await playItemAtRef.current?.(itemIdx, offsetMs);
      }
    } finally {
      isFlippingRef.current = false;
      // fill noise 끝난 후 반대 사이드 처음부터 자동 재생
      if (shouldFlipBack) flipSideRef.current?.(MAX_SIDE_MS);
    }
  }, [cancelAll, getItems, startNoiseTick, stopNoiseTick]);

  useEffect(() => { flipSideRef.current = flipSide; }, [flipSide]);

  const setSide = useCallback((side: Side) => {
    cancelRef.current = true;
    setCurrentSide(side);
    sideRef.current = side;
    setCurrentItemIdx(-1);
    itemIdxRef.current = -1;
    AsyncStorage.setItem(KEY_SIDE, side);
  }, []);

  const addToSide = useCallback(async (side: Side) => {
    const existing = getItems(side);
    const usedMs = totalMs(existing);
    if (usedMs >= MAX_SIDE_MS) {
      Alert.alert("Tape Full", `Side ${side} has already reached the 30-minute limit.`);
      return;
    }
    setIsAdding(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*", multiple: true, copyToCacheDirectory: true,
      });
      if (!result.canceled) {
        // 앱 내부 저장소에 복사하여 앱 재시작 후에도 URI가 유효하도록 함
        const audioDir = FileSystem.documentDirectory + "audio/";
        try {
          await FileSystem.makeDirectoryAsync(audioDir, { intermediates: true });
        } catch {}

        const withDur = await Promise.all(
          result.assets.map(async (a) => {
            const rawName = a.name ?? a.uri.split("/").pop() ?? `track_${Date.now()}`;
            const safeName = rawName.replace(/[^a-zA-Z0-9._\-]/g, "_");
            const localUri = audioDir + safeName;
            let persistUri = a.uri;
            try {
              const destInfo = await FileSystem.getInfoAsync(localUri);
              if (!destInfo.exists) {
                await FileSystem.copyAsync({ from: a.uri, to: localUri });
              }
              const copied = await FileSystem.getInfoAsync(localUri);
              if (copied.exists) persistUri = localUri;
            } catch {}
            const title = rawName.replace(/\.[^/.]+$/, "");
            const duration = await loadFileDuration(persistUri);
            return {
              id: trackId(persistUri),
              type: "track" as const,
              title,
              duration,
              uri: persistUri,
            };
          })
        );

        let items = [...existing];
        let runningMs = usedMs;
        let skipped = 0;

        for (const track of withDur) {
          if (items.find((it) => it.id === track.id)) continue;
          const isEmpty = items.length === 0;
          const addMs = track.duration + DEFAULT_NOISE_MS + (isEmpty ? DEFAULT_NOISE_MS : 0);
          if (runningMs + addMs > MAX_SIDE_MS) {
            skipped++;
            continue;
          }
          if (isEmpty) {
            items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
            items.push(track);
            items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
          } else {
            items.push(track);
            items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
          }
          runningMs += addMs;
        }

        if (skipped > 0) {
          Alert.alert(
            "Time Limit Reached",
            `${skipped} track${skipped > 1 ? "s were" : " was"} not added — Side ${side} would exceed 30 minutes.`
          );
        }
        if (items.length !== existing.length) saveItems(side, items);
      }
    } catch (err) {
      console.warn("addToSide error:", err);
    }
    setIsAdding(false);
  }, [getItems, saveItems]);

  // YouTube iframe에서 상태 변경 이벤트 수신 (player.tsx에서 호출)
  const onYoutubeStateChange = useCallback((state: string) => {
    if (state === "ended") {
      stopYoutubeTick();
      youtubeIdRef.current = null;
      setCurrentYoutubeId(null);
      setYoutubePlaying(false);
      setIsPlaying(false);
      if (!cancelRef.current) advance();
    } else if (state === "playing") {
      setIsPlaying(true);
      setYoutubePlaying(true);
      wasPlayingRef.current = true;
    } else if (state === "paused") {
      setYoutubePlaying(false);
      setIsPlaying(false);
    }
  }, [advance, stopYoutubeTick]);

  // URL(YouTube/직접 스트림) 트랙을 Side에 추가
  const addUrlToSide = useCallback(async (url: string, side: Side, customTitle?: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    const existing = getItems(side);
    const usedMs = totalMs(existing);

    setIsAdding(true);
    try {
      let track: TrackItem;
      const youtubeId = extractYouTubeId(trimmedUrl);

      if (youtubeId) {
        const fetchedTitle = await fetchYouTubeTitle(youtubeId);
        const title = customTitle || fetchedTitle || "YouTube";
        track = {
          id: trackId(youtubeId),
          type: "track" as const,
          title,
          duration: 0, // YouTube는 재생 전까지 시간 미확인
          uri: trimmedUrl,
          sourceType: "youtube",
          youtubeId,
        };
      } else {
        // 직접 스트림 URL
        const rawName = trimmedUrl.split("/").pop()?.split("?")[0] ?? "stream";
        const title = customTitle || rawName.replace(/\.[^/.]+$/, "");
        const duration = await loadFileDuration(trimmedUrl);
        if (duration === 0) {
          Alert.alert(
            "Cannot Load",
            "Failed to load audio from this URL. Make sure it is a direct audio link (mp3, m4a, etc.)."
          );
          return;
        }
        const addMs = duration + DEFAULT_NOISE_MS + (existing.length === 0 ? DEFAULT_NOISE_MS : 0);
        if (usedMs + addMs > MAX_SIDE_MS) {
          Alert.alert(
            "Time Limit Reached",
            `Adding this track would exceed the 30-minute limit for Side ${side}.`
          );
          return;
        }
        track = {
          id: trackId(trimmedUrl),
          type: "track" as const,
          title,
          duration,
          uri: trimmedUrl,
          sourceType: "stream",
        };
      }

      if (existing.find((it) => it.id === track.id)) {
        Alert.alert("Already Added", "This URL is already in the playlist.");
        return;
      }

      const items = [...existing];
      if (items.length === 0) {
        items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
        items.push(track);
        items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
      } else {
        items.push(track);
        items.push({ id: genId("n"), type: "noise", duration: DEFAULT_NOISE_MS });
      }
      saveItems(side, items);
    } catch (err) {
      console.warn("addUrlToSide error:", err);
      Alert.alert("Error", "Could not add the URL. Please check and try again.");
    }
    setIsAdding(false);
  }, [getItems, saveItems]);

  // ── 테이프 컬렉션 관리 ──────────────────────────────────────

  // 선택한 테이프를 데크에 로드 (재생 중이면 정지)
  const selectTape = useCallback(async (id: string) => {
    const tape = tapesRef.current.find((t) => t.id === id);
    if (!tape) return;
    await cancelAll();
    setCurrentItemIdx(-1);
    itemIdxRef.current = -1;
    setTapePosition(0);
    tapePositionRef.current = 0;
    currentTapeIdRef.current = tape.id;
    setCurrentTapeId(tape.id);
    AsyncStorage.setItem(KEY_CURRENT_TAPE, tape.id);
    sideARef.current = tape.sideA;
    sideBRef.current = tape.sideB;
    setSideA(tape.sideA);
    setSideB(tape.sideB);
    setCurrentSide("A");
    sideRef.current = "A";
    AsyncStorage.setItem(KEY_SIDE, "A");
  }, [cancelAll]);

  const createTape = useCallback((name: string) => {
    const tape = createEmptyTape(name.trim() || `MY TAPE ${(tapesRef.current.length + 1).toString().padStart(2, "0")}`);
    persistTapes([...tapesRef.current, tape]);
  }, [persistTapes]);

  const renameTape = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    persistTapes(tapesRef.current.map((t) =>
      t.id === id ? { ...t, name: trimmed, updatedAt: Date.now() } : t
    ));
  }, [persistTapes]);

  const deleteTape = useCallback(async (id: string) => {
    let remaining = tapesRef.current.filter((t) => t.id !== id);
    if (remaining.length === 0) remaining = [createEmptyTape("MY TAPE 01")];
    persistTapes(remaining);
    // 현재 테이프를 지웠으면 첫 번째 테이프를 데크에 로드
    if (currentTapeIdRef.current === id) {
      await cancelAll();
      setCurrentItemIdx(-1);
      itemIdxRef.current = -1;
      setTapePosition(0);
      tapePositionRef.current = 0;
      const next = remaining[0];
      currentTapeIdRef.current = next.id;
      setCurrentTapeId(next.id);
      AsyncStorage.setItem(KEY_CURRENT_TAPE, next.id);
      sideARef.current = next.sideA;
      sideBRef.current = next.sideB;
      setSideA(next.sideA);
      setSideB(next.sideB);
      setCurrentSide("A");
      sideRef.current = "A";
      AsyncStorage.setItem(KEY_SIDE, "A");
    }
  }, [persistTapes, cancelAll]);

  // 공유받은 테이프를 컬렉션에 추가 (id 충돌 방지를 위해 새 id 부여)
  const importTape = useCallback((tape: Tape) => {
    const now = Date.now();
    persistTapes([...tapesRef.current, { ...tape, id: genId("tape"), createdAt: now, updatedAt: now }]);
  }, [persistTapes]);

  const removeTrackItem = useCallback((side: Side, tId: string) => {
    const items = getItems(side);
    const idx = items.findIndex((it) => it.id === tId);
    if (idx === -1) return;
    const updated = [...items];
    const removeFrom = idx > 0 && updated[idx - 1].type === "noise" ? idx - 1 : idx;
    updated.splice(removeFrom, removeFrom < idx ? 2 : 1);
    const hasTrack = updated.some((it) => it.type === "track");
    saveItems(side, hasTrack ? updated : []);
    if (sideRef.current === side && itemIdxRef.current >= removeFrom) {
      cancelRef.current = true;
      stopTrack();
      setIsPlaying(false);
      setIsPlayingNoise(false);
      setCurrentItemIdx(-1);
      itemIdxRef.current = -1;
    }
  }, [getItems, saveItems]);

  const updateNoiseDuration = useCallback((side: Side, noiseId: string, ms: number) => {
    const items = getItems(side);
    const updated = items.map((it) =>
      it.id === noiseId && it.type === "noise"
        ? { ...it, duration: Math.max(200, Math.min(ms, MAX_SIDE_MS)) }
        : it
    );
    if (totalMs(updated) > MAX_SIDE_MS) {
      Alert.alert("Time Limit", "This noise duration would push the tape over 30 minutes.");
      return;
    }
    saveItems(side, updated);
  }, [getItems, saveItems]);

  const activeItems = currentSide === "A" ? sideA : sideB;
  const currentItem = currentItemIdx >= 0 ? activeItems[currentItemIdx] ?? null : null;
  const currentTrack = currentItem?.type === "track" ? currentItem : null;
  const progress = duration > 0 ? position / duration : 0;
  const currentTapeName = tapes.find((t) => t.id === currentTapeId)?.name ?? "";

  return {
    sideA, sideB, currentSide, currentItemIdx, currentTrack,
    isPlaying, isPlayingNoise, isFastForward, isRewind, isLoading, isAdding,
    position, duration, progress, tapePosition,
    togglePlayPause, play, pause, stopPlayback,
    playNext, playPrevious, playItemAt,
    seekTo, seekForward, seekBackward, startFastForward, stopFastForward, startRewind, stopRewind,
    flipSide, addToSide, addUrlToSide, removeTrackItem, updateNoiseDuration, setSide,
    currentYoutubeId, youtubePlaying, onYoutubeStateChange,
    tapes, currentTapeId, currentTapeName,
    createTape, selectTape, renameTape, deleteTape, importTape,
  };
}
