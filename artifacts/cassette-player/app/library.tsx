import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Modal, TextInput, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { AddUrlModal } from "@/components/AddUrlModal";
import { useAudioPlayerContext } from "@/contexts/AudioPlayerContext";
import { SideItem, TrackItem, NoiseItem, Side, MAX_SIDE_MS } from "@/hooks/useAudioPlayer";
import colors from "@/constants/colors";

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function totalMs(items: SideItem[]) {
  return items.reduce((s, it) => s + it.duration, 0);
}

const PRESETS_MS = [500, 1000, 2000, 3000, 5000, 10000];

interface NoiseEditModalProps {
  visible: boolean;
  noise: NoiseItem | null;
  side: Side;
  onSave: (side: Side, noiseId: string, ms: number) => void;
  onClose: () => void;
}

function NoiseEditModal({ visible, noise, side, onSave, onClose }: NoiseEditModalProps) {
  const [custom, setCustom] = useState("");

  const handlePreset = (ms: number) => {
    if (!noise) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSave(side, noise.id, ms);
    onClose();
  };

  const handleCustomSave = () => {
    if (!noise) return;
    const sec = parseFloat(custom.replace(",", "."));
    if (isNaN(sec) || sec <= 0) return;
    onSave(side, noise.id, Math.round(sec * 1000));
    setCustom("");
    onClose();
  };

  const sideColor = side === "A" ? "#9e3c3c" : "#2b5499";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Noise Duration</Text>
          <Text style={styles.modalSub}>
            Current: {noise ? `${(noise.duration / 1000).toFixed(1)}s` : "—"}
          </Text>
          <View style={styles.presetGrid}>
            {PRESETS_MS.map((ms) => {
              const active = noise?.duration === ms;
              return (
                <TouchableOpacity
                  key={ms}
                  style={[styles.presetBtn, active && { backgroundColor: sideColor, borderColor: sideColor }]}
                  onPress={() => handlePreset(ms)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetText, active && { color: "#fff" }]}>
                    {ms < 1000 ? `${ms / 1000}s` : `${ms / 1000}s`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.customLabel}>Custom (seconds)</Text>
          <View style={styles.customRow}>
            <TextInput
              style={styles.customInput}
              value={custom}
              onChangeText={setCustom}
              keyboardType="decimal-pad"
              placeholder="e.g. 4.5"
              placeholderTextColor={colors.light.mutedForeground}
              returnKeyType="done"
              onSubmitEditing={handleCustomSave}
            />
            <TouchableOpacity
              style={[styles.customSaveBtn, { backgroundColor: sideColor }]}
              onPress={handleCustomSave}
              activeOpacity={0.8}
            >
              <Text style={styles.customSaveTxt}>Set</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.modalCloseTxt}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface SidePanelProps {
  side: Side;
  items: SideItem[];
  currentSide: Side;
  currentItemIdx: number;
  isPlaying: boolean;
  isPlayingNoise: boolean;
  isAdding: boolean;
  onPlayItem: (idx: number) => void;
  onRemoveTrack: (trackId: string) => void;
  onEditNoise: (noise: NoiseItem) => void;
  onAdd: () => void;
  onAddUrl: () => void;
}

function SidePanel({
  side, items, currentSide, currentItemIdx, isPlaying, isPlayingNoise,
  isAdding, onPlayItem, onRemoveTrack, onEditNoise, onAdd, onAddUrl,
}: SidePanelProps) {
  const sideColor = side === "A" ? "#9e3c3c" : "#2b5499";
  const used = totalMs(items);
  const remaining = MAX_SIDE_MS - used;
  const fillRatio = Math.min(1, used / MAX_SIDE_MS);
  const isFull = remaining <= 0;
  const trackCount = items.filter((it) => it.type === "track").length;
  let trackNum = 0;

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={[styles.sideBadge, { backgroundColor: sideColor }]}>
          <Text style={styles.sideBadgeText}>SIDE {side}</Text>
        </View>
        <View style={styles.panelHeaderRight}>
          <Text style={[styles.timeUsed, isFull && { color: "#c07040" }]}>{formatMs(used)}</Text>
          <Text style={styles.timeSep}>/</Text>
          <Text style={styles.timeTotal}>30:00</Text>
        </View>
      </View>

      <View style={styles.tapeBar}>
        <View style={[styles.tapeFill, { width: `${fillRatio * 100}%`, backgroundColor: sideColor }]} />
      </View>
      <Text style={[styles.timeRemaining, isFull && { color: "#c07040" }]}>
        {isFull ? "Tape full — 30:00 limit reached" : `${formatMs(remaining)} remaining`}
      </Text>

      {items.map((item, itemIdx) => {
        const isCurrentItem = currentSide === side && currentItemIdx === itemIdx;
        const isActive = isCurrentItem;

        if (item.type === "noise") {
          const isLastItem = itemIdx === items.length - 1;
          const fillMs = isLastItem
            ? MAX_SIDE_MS - (used - item.duration)
            : null;
          return (
            <TouchableOpacity
              key={item.id}
              style={[styles.noiseRow, isActive && styles.noiseRowActive]}
              onPress={() => onEditNoise(item)}
              activeOpacity={0.7}
            >
              <View style={styles.noiseIcon}>
                <Text style={styles.noiseIconChar}>≈</Text>
              </View>
              <View style={styles.noiseInfo}>
                <Text style={styles.noiseLabel}>
                  {isLastItem ? "TAPE FILL" : "TAPE NOISE"}
                </Text>
                {isLastItem ? (
                  <Text style={[styles.noiseDur, styles.noiseFillDur]}>
                    {formatMs(fillMs!)}
                    <Text style={styles.noiseFillHint}> (to end)</Text>
                  </Text>
                ) : (
                  <Text style={styles.noiseDur}>{(item.duration / 1000).toFixed(1)}s</Text>
                )}
              </View>
              {!isLastItem && (
                <View style={styles.editHint}>
                  <Text style={styles.editHintText}>edit</Text>
                  <Icon name="info" size={11} color={colors.light.mutedForeground} />
                </View>
              )}
            </TouchableOpacity>
          );
        } else {
          trackNum++;
          const isPlayingThis = isActive && isPlaying && !isPlayingNoise;
          return (
            <View key={item.id} style={[styles.trackRow, isActive && !isPlayingNoise && styles.trackRowActive]}>
              <TouchableOpacity
                style={styles.trackPlayArea}
                onPress={() => onPlayItem(itemIdx)}
                activeOpacity={0.7}
              >
                <View style={[styles.trackNum, isPlayingThis && { backgroundColor: sideColor, borderColor: sideColor }]}>
                  {isPlayingThis
                    ? <Icon name="volume-2" size={13} color="#fff" />
                    : <Text style={[styles.trackNumText, isActive && { color: colors.light.cassetteBeige }]}>
                        {trackNum.toString().padStart(2, "0")}
                      </Text>
                  }
                </View>
                <View style={styles.trackInfo}>
                  <Text style={[styles.trackName, isActive && { color: colors.light.cassetteBeige }]} numberOfLines={1}>
                    {item.title}
                  </Text>
                </View>
                <Text style={styles.trackDur}>
                  {item.duration > 0 ? formatMs(item.duration) : "--:--"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => onRemoveTrack(item.id)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Icon name="x" size={16} color={colors.light.mutedForeground} />
              </TouchableOpacity>
            </View>
          );
        }
      })}

      {!isFull && (
        <View style={styles.addBtnGroup}>
          <TouchableOpacity
            style={[styles.addBtn, styles.addBtnFlex, { borderColor: sideColor }, isAdding && styles.addBtnDisabled]}
            onPress={onAdd}
            disabled={isAdding}
            activeOpacity={0.8}
          >
            {isAdding ? (
              <View style={styles.addRow}>
                <ActivityIndicator size="small" color={sideColor} />
                <Text style={[styles.addTxt, { color: sideColor }]}>Loading…</Text>
              </View>
            ) : (
              <View style={styles.addRow}>
                <Icon name="plus" size={16} color={sideColor} />
                <Text style={[styles.addTxt, { color: sideColor }]}>Add Files</Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addBtn, styles.addBtnFlex, { borderColor: sideColor }, isAdding && styles.addBtnDisabled]}
            onPress={onAddUrl}
            disabled={isAdding}
            activeOpacity={0.8}
          >
            <View style={styles.addRow}>
              <Icon name="link" size={16} color={sideColor} />
              <Text style={[styles.addTxt, { color: sideColor }]}>Add URL</Text>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {trackCount === 0 && !isAdding && (
        <View style={styles.emptyState}>
          <Icon name="music" size={36} color={colors.light.mutedForeground} />
          <Text style={styles.emptyTxt}>No tracks on Side {side}</Text>
          <Text style={styles.emptyHint}>Tap "Add Audio Files" to load songs</Text>
        </View>
      )}
    </View>
  );
}

export default function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [tab, setTab] = useState<Side>("A");
  const [editingNoise, setEditingNoise] = useState<{ noise: NoiseItem; side: Side } | null>(null);
  const [urlModalSide, setUrlModalSide] = useState<Side | null>(null);

  const {
    sideA, sideB, currentSide, currentItemIdx, isPlaying, isPlayingNoise, isAdding,
    playItemAt, addToSide, addUrlToSide, removeTrackItem, updateNoiseDuration, setSide,
    currentTapeName,
  } = useAudioPlayerContext();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handlePlayItem = (side: Side, itemIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSide(side);
    playItemAt(itemIdx);
    router.back();
  };

  const handleRemove = (side: Side, trackId: string) => {
    const items = side === "A" ? sideA : sideB;
    const track = items.find((it) => it.id === trackId) as TrackItem | undefined;
    if (!track) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    removeTrackItem(side, trackId);
  };

  const handleEditNoise = (side: Side, noise: NoiseItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingNoise({ noise, side });
  };

  const aItems = sideA;
  const bItems = sideB;
  const aPct = Math.min(100, Math.round((totalMs(aItems) / MAX_SIDE_MS) * 100));
  const bPct = Math.min(100, Math.round((totalMs(bItems) / MAX_SIDE_MS) * 100));

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Icon name="arrow-left" size={22} color={colors.light.cassetteBeige} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>LIBRARY</Text>
          {!!currentTapeName && (
            <Text style={styles.headerTapeName} numberOfLines={1}>{currentTapeName}</Text>
          )}
        </View>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.tabs}>
        {(["A", "B"] as Side[]).map((s) => {
          const active = tab === s;
          const borderC = s === "A" ? "#9e3c3c" : "#2b5499";
          const pct = s === "A" ? aPct : bPct;
          return (
            <TouchableOpacity
              key={s}
              style={[styles.tab, active && { borderBottomColor: borderC, borderBottomWidth: 2 }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTab(s); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.tabText, active && styles.activeTabText]}>SIDE {s}</Text>
              <Text style={[styles.tabPct, active && { color: borderC }]}>{pct}%</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {tab === "A"
          ? <SidePanel
              side="A" items={aItems}
              currentSide={currentSide} currentItemIdx={currentItemIdx}
              isPlaying={isPlaying} isPlayingNoise={isPlayingNoise} isAdding={isAdding}
              onPlayItem={(idx) => handlePlayItem("A", idx)}
              onRemoveTrack={(id) => handleRemove("A", id)}
              onEditNoise={(n) => handleEditNoise("A", n)}
              onAdd={() => addToSide("A")}
              onAddUrl={() => setUrlModalSide("A")}
            />
          : <SidePanel
              side="B" items={bItems}
              currentSide={currentSide} currentItemIdx={currentItemIdx}
              isPlaying={isPlaying} isPlayingNoise={isPlayingNoise} isAdding={isAdding}
              onPlayItem={(idx) => handlePlayItem("B", idx)}
              onRemoveTrack={(id) => handleRemove("B", id)}
              onEditNoise={(n) => handleEditNoise("B", n)}
              onAdd={() => addToSide("B")}
              onAddUrl={() => setUrlModalSide("B")}
            />
        }
      </ScrollView>

      <NoiseEditModal
        visible={!!editingNoise}
        noise={editingNoise?.noise ?? null}
        side={editingNoise?.side ?? "A"}
        onSave={updateNoiseDuration}
        onClose={() => setEditingNoise(null)}
      />

      <AddUrlModal
        visible={!!urlModalSide}
        side={urlModalSide ?? "A"}
        isAdding={isAdding}
        onAdd={addUrlToSide}
        onClose={() => setUrlModalSide(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.light.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 10,
  },
  iconBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center", gap: 2 },
  headerTitle: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_600SemiBold", letterSpacing: 3,
  },
  headerTapeName: {
    color: colors.light.cassetteBeige, fontSize: 12,
    fontFamily: "Inter_600SemiBold", letterSpacing: 0.3,
  },
  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.light.border },
  tab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 12, gap: 8, borderBottomWidth: 2, borderBottomColor: "transparent",
  },
  tabText: {
    fontSize: 12, fontFamily: "Inter_600SemiBold",
    color: colors.light.mutedForeground, letterSpacing: 2,
  },
  activeTabText: { color: colors.light.cassetteCream },
  tabPct: { fontSize: 11, fontFamily: "Inter_500Medium", color: colors.light.mutedForeground },
  scroll: { flex: 1 },
  panel: { paddingHorizontal: 16, paddingTop: 16 },
  panelHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  sideBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  sideBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 2 },
  panelHeaderRight: {
    flex: 1, flexDirection: "row", alignItems: "center",
    justifyContent: "flex-end", gap: 4,
  },
  timeUsed: { color: colors.light.cassetteCream, fontSize: 15, fontFamily: "Inter_700Bold" },
  timeSep: { color: colors.light.mutedForeground, fontSize: 13 },
  timeTotal: { color: colors.light.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" },
  tapeBar: { height: 5, backgroundColor: colors.light.secondary, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  tapeFill: { height: "100%", borderRadius: 3 },
  timeRemaining: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_400Regular", marginBottom: 12,
  },

  noiseRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 7, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: colors.light.border,
    backgroundColor: "transparent",
  },
  noiseRowActive: { backgroundColor: "rgba(180,140,80,0.08)" },
  noiseIcon: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: colors.light.card,
    borderWidth: 1, borderColor: colors.light.border,
    alignItems: "center", justifyContent: "center",
  },
  noiseIconChar: { color: colors.light.mutedForeground, fontSize: 18, fontFamily: "Inter_700Bold", lineHeight: 22 },
  noiseInfo: { flex: 1 },
  noiseLabel: {
    color: colors.light.mutedForeground, fontSize: 10,
    fontFamily: "Inter_700Bold", letterSpacing: 2,
  },
  noiseDur: {
    color: colors.light.cassetteCream, fontSize: 14,
    fontFamily: "Inter_600SemiBold", marginTop: 1,
  },
  noiseFillDur: {
    color: colors.light.cassetteBeige, fontSize: 15,
    fontFamily: "Inter_700Bold",
  },
  noiseFillHint: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_400Regular", fontStyle: "italic",
  },
  editHint: { flexDirection: "row", alignItems: "center", gap: 4 },
  editHintText: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_400Regular", fontStyle: "italic",
  },

  trackRow: {
    flexDirection: "row", alignItems: "center",
    borderBottomWidth: 1, borderBottomColor: colors.light.border,
  },
  trackRowActive: { backgroundColor: colors.light.secondary },
  trackPlayArea: {
    flex: 1, flexDirection: "row", alignItems: "center",
    gap: 12, paddingVertical: 12, paddingLeft: 4,
  },
  trackNum: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1, borderColor: colors.light.border,
    backgroundColor: colors.light.card,
    alignItems: "center", justifyContent: "center",
  },
  trackNumText: { color: colors.light.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" },
  trackInfo: { flex: 1 },
  trackName: {
    color: colors.light.cassetteCream, fontSize: 14,
    fontFamily: "Inter_500Medium", letterSpacing: 0.2,
  },
  trackDur: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_400Regular", letterSpacing: 0.5, minWidth: 38, textAlign: "right",
  },
  removeBtn: {
    paddingHorizontal: 8, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    minWidth: 40,
  },

  addBtnGroup: { flexDirection: "row", gap: 10, marginTop: 16 },
  addBtnFlex: { flex: 1, marginTop: 0, paddingHorizontal: 12 },
  addBtn: {
    borderWidth: 1.5, borderRadius: 10,
    paddingVertical: 14, paddingHorizontal: 20, alignItems: "center",
  },
  addBtnDisabled: { opacity: 0.7 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyTxt: { color: colors.light.cassetteCream, fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { color: colors.light.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" },

  modalOverlay: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
  modalSheet: {
    backgroundColor: colors.light.card,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 36,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.light.border, alignSelf: "center", marginBottom: 20,
  },
  modalTitle: {
    color: colors.light.cassetteCream, fontSize: 18,
    fontFamily: "Inter_700Bold", marginBottom: 4,
  },
  modalSub: {
    color: colors.light.mutedForeground, fontSize: 13,
    fontFamily: "Inter_400Regular", marginBottom: 20,
  },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 24 },
  presetBtn: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
    borderWidth: 1.5, borderColor: colors.light.border,
  },
  presetText: {
    color: colors.light.cassetteCream, fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  customLabel: {
    color: colors.light.mutedForeground, fontSize: 12,
    fontFamily: "Inter_500Medium", letterSpacing: 0.5, marginBottom: 10,
  },
  customRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  customInput: {
    flex: 1, height: 46, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.light.border,
    paddingHorizontal: 14,
    color: colors.light.cassetteCream,
    fontFamily: "Inter_500Medium", fontSize: 15,
  },
  customSaveBtn: {
    height: 46, paddingHorizontal: 20, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  customSaveTxt: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  modalCloseBtn: { alignItems: "center", paddingVertical: 8 },
  modalCloseTxt: { color: colors.light.mutedForeground, fontSize: 14, fontFamily: "Inter_500Medium" },
});
