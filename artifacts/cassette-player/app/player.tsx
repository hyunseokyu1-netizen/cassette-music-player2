import React, { useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from "react-native";
import Animated, {
  useSharedValue, withSequence, withTiming, useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import YoutubeIframe, { YoutubeIframeRef } from "react-native-youtube-iframe";
import { CassetteTape } from "@/components/CassetteTape";
import { ControlButtons } from "@/components/ControlButtons";
import { ProgressBar } from "@/components/ProgressBar";
import { Icon } from "@/components/Icon";
import { useAudioPlayerContext } from "@/contexts/AudioPlayerContext";
import { TrackItem } from "@/hooks/useAudioPlayer";
import colors from "@/constants/colors";

export default function PlayerScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    sideA, sideB, currentSide, currentTrack,
    isPlaying, isLoading, isPlayingNoise, isFastForward, isRewind, tapePosition,
    togglePlayPause,
    seekForward, startFastForward, stopFastForward, startRewind, stopRewind, flipSide,
    currentYoutubeId, youtubePlaying, onYoutubeStateChange, onYoutubeReady,
    youtubeSeekRequest, onYoutubeSeekApplied, currentTapeName,
  } = useAudioPlayerContext();

  const ytRef = useRef<YoutubeIframeRef>(null);
  // seek 요청을 ref로 미러링 — onChangeState 콜백의 stale closure 방지
  const seekReqRef = useRef(youtubeSeekRequest);
  useEffect(() => { seekReqRef.current = youtubeSeekRequest; }, [youtubeSeekRequest]);

  // seek 이중 적용: 요청 즉시 1차 시도(플레이어가 준비된 경우 바로 반영),
  // "playing" 이벤트에서 2차 확정(loadVideoById 직후처럼 1차가 무시되는 경우 대비)
  useEffect(() => {
    if (!youtubeSeekRequest || !ytRef.current) return;
    if (youtubeSeekRequest.ms > 500) {
      try {
        Promise.resolve(ytRef.current.seekTo(youtubeSeekRequest.ms / 1000, true)).catch(() => {});
      } catch {}
    }
  }, [youtubeSeekRequest]);

  const handleYtStateChange = useCallback((state: string) => {
    if (state === "playing" && seekReqRef.current && ytRef.current) {
      const { ms } = seekReqRef.current;
      seekReqRef.current = null;
      onYoutubeSeekApplied();
      if (ms > 500) {
        try {
          Promise.resolve(ytRef.current.seekTo(ms / 1000, true)).catch(() => {});
        } catch {}
      }
    }
    onYoutubeStateChange(state);
  }, [onYoutubeStateChange, onYoutubeSeekApplied]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const scaleX = useSharedValue(1);

  const handleFlip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // FF/REW 진행 중이면 먼저 중단
    await stopFastForward();
    await stopRewind();
    const currentTapePos = tapePosition;
    scaleX.value = withSequence(
      withTiming(0, { duration: 180 }),
      withTiming(1, { duration: 180 })
    );
    setTimeout(() => flipSide(currentTapePos), 180);
  }, [flipSide, tapePosition, stopFastForward, stopRewind]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: scaleX.value }] }));

  // 노이즈 재생 중에도 이전 곡 이름 유지
  const lastTrackTitleRef = useRef("");
  if (currentTrack) lastTrackTitleRef.current = currentTrack.title;

  const sideATracks = sideA.filter((it): it is TrackItem => it.type === "track");
  const sideBTracks = sideB.filter((it): it is TrackItem => it.type === "track");
  const activeTracks = currentSide === "A" ? sideATracks : sideBTracks;
  const hasTracks = activeTracks.length > 0;
  const trackTitles = activeTracks.map((t) => t.title);
  const sideColor = currentSide === "A" ? "#c0524a" : "#4a80c0";
  const isYouTubeTrack = currentTrack?.sourceType === "youtube" && !!currentYoutubeId;

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: bottomPad }]}>
      <View style={styles.header}>
        <View style={styles.headerGroup}>
          <TouchableOpacity onPress={() => router.push("/tapes")} style={styles.btn} activeOpacity={0.7}>
            <Icon name="cassette" size={22} color={colors.light.cassetteBeige} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push("/library")} style={styles.btn} activeOpacity={0.7}>
            <Icon name="list" size={22} color={colors.light.cassetteBeige} />
          </TouchableOpacity>
        </View>
        <View style={[styles.sidePill, { borderColor: sideColor }]}>
          <Text style={[styles.sidePillText, { color: sideColor }]}>SIDE {currentSide}</Text>
        </View>
        <View style={styles.headerGroup}>
          <View style={styles.btn} />
          <TouchableOpacity onPress={handleFlip} style={styles.btn} activeOpacity={0.7} disabled={false}>
            <Icon name="refresh-cw" size={20}
              color={colors.light.cassetteBeige} />
          </TouchableOpacity>
        </View>
      </View>

      {!!currentTapeName && (
        <Text style={styles.tapeNameLabel} numberOfLines={1}>{currentTapeName}</Text>
      )}

      {/* 카세트가 항상 메인 비주얼. YouTube 트랙이면 그 아래 작은 영상 창 표시 */}
      <View style={[styles.cassetteWrapper, isYouTubeTrack && styles.cassetteWrapperCompact]}>
        <Animated.View style={animStyle}>
          <CassetteTape
            isPlaying={isPlaying}
            isTransitioning={isPlayingNoise}
            isFastForward={isFastForward}
            isRewind={isRewind}
            progress={tapePosition / (30 * 60 * 1000)}
            side={currentSide}
            title={currentTrack?.title ?? ""}
            tracks={trackTitles}
            width={320}
          />
        </Animated.View>
      </View>

      {isYouTubeTrack && (
        <View style={styles.youtubeWrapper}>
          {/* YouTube 정책상 임베드는 최소 200x200 유지, 화면에 보여야 재생됨 */}
          <YoutubeIframe
            ref={ytRef}
            height={200}
            width={356}
            videoId={currentYoutubeId!}
            play={youtubePlaying}
            onChangeState={handleYtStateChange}
            onReady={() => {
              // 실제 영상 길이로 저장된 duration 보정
              ytRef.current?.getDuration()
                .then((d) => { if (d) onYoutubeReady(d); })
                .catch(() => {});
            }}
            webViewProps={{
              // Android WebView 자동재생 허용 (터치 없이 재생 시작)
              mediaPlaybackRequiresUserAction: false,
              // webview 13.x는 RN→WebView postMessage를 document에 전달하지만
              // 라이브러리는 window에서 수신 → 브리지 없으면 play/pause 명령이 유실됨
              injectedJavaScript: `
                document.addEventListener('message', function (e) {
                  window.dispatchEvent(new MessageEvent('message', { data: e.data }));
                });
                true;
              `,
            }}
            initialPlayerParams={{ preventFullScreen: true }}
            webViewStyle={{ opacity: 0.99 }}
          />
        </View>
      )}
      {isYouTubeTrack && (
        <Text style={styles.youtubeHint}>재생·일시정지는 영상 화면의 버튼을 사용하세요</Text>
      )}

      <View style={[styles.trackInfo, isYouTubeTrack && styles.trackInfoCompact]}>
        <Text style={styles.trackTitle} numberOfLines={isYouTubeTrack ? 1 : 2}>
          {currentTrack?.title ?? (isPlayingNoise ? lastTrackTitleRef.current : (hasTracks ? "Tap PLAY to start" : "Open library to add tracks"))}
        </Text>
        <View style={styles.sideRow}>
          <Text style={[styles.sideCount, sideATracks.length > 0 && { color: "#c0524a" }]}>
            {`A: ${sideATracks.length} tracks`}
          </Text>
          <Text style={styles.sideDot}>·</Text>
          <Text style={[styles.sideCount, sideBTracks.length > 0 && { color: "#4a80c0" }]}>
            {`B: ${sideBTracks.length} tracks`}
          </Text>
        </View>
      </View>

      <ProgressBar tapePosition={tapePosition} />

      <View style={[styles.controls, isYouTubeTrack && styles.controlsCompact]}>
        <ControlButtons
          isPlaying={isPlaying}
          isLoading={isLoading}
          hasTracks={hasTracks}
          onPlayPause={togglePlayPause}
          onFFStart={startFastForward}
          onFFStop={stopFastForward}
          onRWStart={startRewind}
          onRWStop={stopRewind}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity onPress={handleFlip} style={styles.flipBtn} activeOpacity={0.8} disabled={false}>
          <Icon name="refresh-cw" size={13} color={colors.light.cassetteDark} />
          <Text style={styles.flipText}>FLIP TO SIDE {currentSide === "A" ? "B" : "A"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  btn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerGroup: { flexDirection: "row", alignItems: "center" },
  sidePill: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  sidePillText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  tapeNameLabel: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_600SemiBold", letterSpacing: 1.5,
    textAlign: "center", marginBottom: 2, paddingHorizontal: 40,
  },
  cassetteWrapper: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 18 },
  // YouTube 영상 창이 추가로 표시될 때 세로 공간 확보용 압축 여백
  cassetteWrapperCompact: { paddingVertical: 2 },
  youtubeHint: {
    color: colors.light.mutedForeground, fontSize: 10,
    fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 2,
  },
  // 16:9(356x200)로 레터박스 없이 자연스럽게. 좁은 화면에서는 maxWidth로 좌우만 살짝 크롭
  youtubeWrapper: {
    alignSelf: "center",
    width: 356,
    maxWidth: "94%",
    height: 200,
    marginBottom: 6,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#000",
    borderWidth: 2,
    borderColor: colors.light.border,
  },
  trackInfo: {
    paddingHorizontal: 28, alignItems: "center", gap: 6,
    marginBottom: 12, minHeight: 52, justifyContent: "center",
  },
  trackInfoCompact: { marginBottom: 4, minHeight: 40 },
  trackTitle: {
    color: colors.light.cassetteCream, fontSize: 17,
    fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 0.4,
  },
sideRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideCount: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.light.mutedForeground, letterSpacing: 0.5 },
  sideDot: { color: colors.light.mutedForeground, fontSize: 12 },
  controls: { marginTop: 12, marginBottom: 14 },
  controlsCompact: { marginTop: 4, marginBottom: 8 },
  footer: { alignItems: "center" },
  flipBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: colors.light.cassetteBeige,
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
  },
  flipText: { color: colors.light.cassetteDark, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 2 },
});
