import React, { useCallback, useRef } from "react";
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
    currentYoutubeId, youtubePlaying, onYoutubeStateChange, onYoutubeReady, currentTapeName,
  } = useAudioPlayerContext();

  const ytRef = useRef<YoutubeIframeRef>(null);

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

      {/* YouTube 트랙일 때는 카세트 대신 iframe 플레이어 표시 */}
      {isYouTubeTrack ? (
        <View style={styles.youtubeWrapper}>
          <YoutubeIframe
            ref={ytRef}
            height={200}
            videoId={currentYoutubeId!}
            play={youtubePlaying}
            onChangeState={onYoutubeStateChange}
            onReady={() => {
              // 실제 영상 길이로 저장된 duration 보정
              ytRef.current?.getDuration()
                .then((d) => { if (d) onYoutubeReady(d); })
                .catch(() => {});
            }}
            // Android WebView 자동재생 허용 (터치 없이 재생 시작)
            webViewProps={{ mediaPlaybackRequiresUserAction: false }}
            initialPlayerParams={{ preventFullScreen: true }}
            webViewStyle={{ opacity: 0.99 }}
          />
          <View style={styles.youtubeBadge}>
            <Icon name="youtube" size={13} color="#ff3b30" />
            <Text style={styles.youtubeBadgeText}>YouTube</Text>
          </View>
        </View>
      ) : (
        <View style={styles.cassetteWrapper}>
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
      )}

      <View style={styles.trackInfo}>
        <Text style={styles.trackTitle} numberOfLines={2}>
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

      <View style={styles.controls}>
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
  youtubeWrapper: {
    marginHorizontal: 18,
    marginVertical: 10,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#000",
  },
  youtubeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  youtubeBadgeText: {
    color: "#ff3b30",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
  },
  trackInfo: {
    paddingHorizontal: 28, alignItems: "center", gap: 6,
    marginBottom: 12, minHeight: 52, justifyContent: "center",
  },
  trackTitle: {
    color: colors.light.cassetteCream, fontSize: 17,
    fontFamily: "Inter_700Bold", textAlign: "center", letterSpacing: 0.4,
  },
sideRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sideCount: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.light.mutedForeground, letterSpacing: 0.5 },
  sideDot: { color: colors.light.mutedForeground, fontSize: 12 },
  controls: { marginTop: 12, marginBottom: 14 },
  footer: { alignItems: "center" },
  flipBtn: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: colors.light.cassetteBeige,
    paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20,
  },
  flipText: { color: colors.light.cassetteDark, fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 2 },
});
