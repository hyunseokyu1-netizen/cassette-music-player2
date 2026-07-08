import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
  ScrollView, Modal, TextInput, KeyboardAvoidingView, Alert, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import { useAudioPlayerContext } from "@/contexts/AudioPlayerContext";
import { SideItem, Tape } from "@/hooks/useAudioPlayer";
import { encodeTapeShare, decodeTapeShare } from "@/utils/tapeShare";
import colors from "@/constants/colors";

function trackCount(items: SideItem[]) {
  return items.filter((it) => it.type === "track").length;
}

function totalDurationLabel(tape: Tape): string {
  const ms = [...tape.sideA, ...tape.sideB]
    .filter((it) => it.type === "track")
    .reduce((s, it) => s + it.duration, 0);
  if (ms <= 0) return "";
  const min = Math.round(ms / 60000);
  return min > 0 ? `${min}min` : "<1min";
}

interface NameModalProps {
  visible: boolean;
  title: string;
  initialValue: string;
  submitLabel: string;
  onSubmit: (name: string) => void;
  onClose: () => void;
}

function NameModal({ visible, title, initialValue, submitLabel, onSubmit, onClose }: NameModalProps) {
  const [name, setName] = useState(initialValue);

  // 모달이 열릴 때마다 초기값 재설정
  const prevVisible = React.useRef(visible);
  if (visible && !prevVisible.current) setName(initialValue);
  prevVisible.current = visible;

  const handleSubmit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSubmit(name);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.modalInput}
            value={name}
            onChangeText={setName}
            placeholder="e.g. 새벽 감성 믹스테이프"
            placeholderTextColor={colors.light.mutedForeground}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
            autoFocus
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleSubmit} activeOpacity={0.8}>
              <Text style={styles.modalSubmitTxt}>{submitLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

interface ImportModalProps {
  visible: boolean;
  onImport: (tape: Tape) => void;
  onClose: () => void;
}

function ImportModal({ visible, onImport, onClose }: ImportModalProps) {
  const [text, setText] = useState("");

  // 공유 메시지 전체를 붙여넣어도 CT2 코드만 자동 인식 → 실시간 미리보기
  const preview = text.trim() ? decodeTapeShare(text) : null;

  const handleImport = () => {
    if (!preview) {
      Alert.alert("가져오기 실패", "올바른 테이프 코드(CT2:…)를 찾을 수 없습니다. 공유받은 텍스트 전체를 붙여넣어 주세요.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onImport(preview);
    setText("");
    onClose();
    const total = trackCount(preview.sideA) + trackCount(preview.sideB);
    Alert.alert("테이프 도착 📼", `「${preview.name}」 (${total}곡)이 내 테이프 목록에 추가되었습니다.`);
  };

  const handleClose = () => { setText(""); onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalTitleRow}>
            <Icon name="download" size={18} color={colors.light.cassetteBeige} />
            <Text style={styles.modalTitle}>테이프 가져오기</Text>
          </View>
          <Text style={styles.modalSub}>공유받은 텍스트를 그대로 붙여넣으세요.</Text>
          <TextInput
            style={[styles.modalInput, styles.importInput]}
            value={text}
            onChangeText={setText}
            placeholder="📼 Cassette Player 2 — Mixtape …"
            placeholderTextColor={colors.light.mutedForeground}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
          {text.trim().length > 0 && (
            preview ? (
              <View style={styles.previewRow}>
                <Icon name="check" size={14} color="#5a9e5a" />
                <Text style={styles.previewFound} numberOfLines={1}>
                  {`「${preview.name}」 · A ${trackCount(preview.sideA)}곡 / B ${trackCount(preview.sideB)}곡`}
                </Text>
              </View>
            ) : (
              <View style={styles.previewRow}>
                <Icon name="info" size={14} color="#c07040" />
                <Text style={styles.previewMissing}>테이프 코드(CT2:…)를 아직 찾지 못했어요</Text>
              </View>
            )
          )}
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.modalCancelTxt}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalSubmitBtn, !preview && { opacity: 0.4 }]}
              onPress={handleImport}
              disabled={!preview}
              activeOpacity={0.8}
            >
              <Text style={styles.modalSubmitTxt}>Import</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TapesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    tapes, currentTapeId, isPlaying,
    createTape, selectTape, renameTape, deleteTape, importTape,
  } = useAudioPlayerContext();

  const [createVisible, setCreateVisible] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [renaming, setRenaming] = useState<Tape | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const handleSelect = async (tape: Tape) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (tape.id !== currentTapeId) await selectTape(tape.id);
    router.back();
  };

  const handleShare = async (tape: Tape) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const { text, sharedTrackCount, removedLocalCount } = encodeTapeShare(tape);
    if (sharedTrackCount === 0) {
      Alert.alert(
        "공유할 곡이 없어요",
        "로컬 파일 트랙은 다른 기기에서 재생할 수 없어 공유에서 제외됩니다. YouTube/URL 트랙을 담아 공유해 보세요."
      );
      return;
    }
    const doShare = () => Share.share({ message: text }).catch(() => {});
    if (removedLocalCount > 0) {
      Alert.alert(
        "로컬 파일 제외",
        `로컬 파일 트랙 ${removedLocalCount}개는 다른 기기에서 재생할 수 없어 공유에서 제외됩니다.`,
        [{ text: "취소", style: "cancel" }, { text: "공유하기", onPress: doShare }]
      );
    } else {
      doShare();
    }
  };

  const handleDelete = (tape: Tape) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert("테이프 삭제", `「${tape.name}」 테이프를 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: () => deleteTape(tape.id) },
    ]);
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} activeOpacity={0.7}>
          <Icon name="arrow-left" size={22} color={colors.light.cassetteBeige} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MY TAPES</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: bottomPad + 24, paddingHorizontal: 16, paddingTop: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {tapes.map((tape) => {
          const isCurrent = tape.id === currentTapeId;
          const aCnt = trackCount(tape.sideA);
          const bCnt = trackCount(tape.sideB);
          const durLabel = totalDurationLabel(tape);
          return (
            <View key={tape.id} style={[styles.tapeCard, isCurrent && styles.tapeCardActive]}>
              <TouchableOpacity style={styles.tapeMain} onPress={() => handleSelect(tape)} activeOpacity={0.75}>
                <View style={[styles.tapeIconWrap, isCurrent && { borderColor: colors.light.cassetteBeige }]}>
                  <Icon name="cassette" size={26} color={isCurrent ? colors.light.cassetteBeige : colors.light.mutedForeground} />
                </View>
                <View style={styles.tapeInfo}>
                  <Text style={[styles.tapeName, isCurrent && { color: colors.light.cassetteCream }]} numberOfLines={1}>
                    {tape.name}
                  </Text>
                  <Text style={styles.tapeMeta}>
                    {`A ${aCnt}곡 · B ${bCnt}곡${durLabel ? ` · ${durLabel}` : ""}`}
                    {tape.sharedFrom ? "  ·  공유받음" : ""}
                  </Text>
                </View>
                {isCurrent && (
                  <View style={styles.currentBadge}>
                    <Text style={styles.currentBadgeTxt}>{isPlaying ? "PLAYING" : "IN DECK"}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.tapeActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleShare(tape)} activeOpacity={0.7}>
                  <Icon name="share-2" size={15} color={colors.light.mutedForeground} />
                  <Text style={styles.actionTxt}>공유</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setRenaming(tape)} activeOpacity={0.7}>
                  <Icon name="edit-3" size={15} color={colors.light.mutedForeground} />
                  <Text style={styles.actionTxt}>이름</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(tape)} activeOpacity={0.7}>
                  <Icon name="trash-2" size={15} color={colors.light.mutedForeground} />
                  <Text style={styles.actionTxt}>삭제</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        <View style={styles.bottomBtns}>
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCreateVisible(true); }}
            activeOpacity={0.8}
          >
            <Icon name="plus" size={16} color={colors.light.cassetteBeige} />
            <Text style={styles.newBtnTxt}>새 테이프</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.importBtn}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setImportVisible(true); }}
            activeOpacity={0.8}
          >
            <Icon name="download" size={16} color={colors.light.cassetteDark} />
            <Text style={styles.importBtnTxt}>테이프 가져오기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <NameModal
        visible={createVisible}
        title="새 테이프 만들기"
        initialValue=""
        submitLabel="Create"
        onSubmit={createTape}
        onClose={() => setCreateVisible(false)}
      />
      <NameModal
        visible={!!renaming}
        title="테이프 이름 변경"
        initialValue={renaming?.name ?? ""}
        submitLabel="Save"
        onSubmit={(name) => renaming && renameTape(renaming.id, name)}
        onClose={() => setRenaming(null)}
      />
      <ImportModal
        visible={importVisible}
        onImport={importTape}
        onClose={() => setImportVisible(false)}
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
  headerTitle: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_600SemiBold", letterSpacing: 3,
  },
  scroll: { flex: 1 },

  tapeCard: {
    backgroundColor: colors.light.card,
    borderWidth: 1, borderColor: colors.light.border,
    borderRadius: 12, marginBottom: 12, overflow: "hidden",
  },
  tapeCardActive: { borderColor: colors.light.cassetteBeige },
  tapeMain: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  tapeIconWrap: {
    width: 44, height: 44, borderRadius: 8,
    borderWidth: 1, borderColor: colors.light.border,
    backgroundColor: colors.light.background,
    alignItems: "center", justifyContent: "center",
  },
  tapeInfo: { flex: 1 },
  tapeName: {
    color: colors.light.cassetteBeige, fontSize: 15,
    fontFamily: "Inter_600SemiBold", letterSpacing: 0.3,
  },
  tapeMeta: {
    color: colors.light.mutedForeground, fontSize: 11,
    fontFamily: "Inter_400Regular", marginTop: 3,
  },
  currentBadge: {
    borderWidth: 1, borderColor: colors.light.cassetteBeige,
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  currentBadgeTxt: {
    color: colors.light.cassetteBeige, fontSize: 9,
    fontFamily: "Inter_700Bold", letterSpacing: 1.5,
  },
  tapeActions: {
    flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.light.border,
  },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 6, paddingVertical: 10,
  },
  actionTxt: {
    color: colors.light.mutedForeground, fontSize: 12,
    fontFamily: "Inter_500Medium",
  },

  bottomBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  newBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderWidth: 1.5, borderColor: colors.light.cassetteBeige,
    borderRadius: 10, paddingVertical: 14,
  },
  newBtnTxt: { color: colors.light.cassetteBeige, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  importBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, backgroundColor: colors.light.cassetteBeige,
    borderRadius: 10, paddingVertical: 14,
  },
  importBtnTxt: { color: colors.light.cassetteDark, fontSize: 14, fontFamily: "Inter_600SemiBold" },

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
  modalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  modalTitle: {
    color: colors.light.cassetteCream, fontSize: 18,
    fontFamily: "Inter_700Bold", marginBottom: 4,
  },
  modalSub: {
    color: colors.light.mutedForeground, fontSize: 13,
    fontFamily: "Inter_400Regular", marginBottom: 14, marginTop: 4,
  },
  modalInput: {
    height: 46, borderRadius: 10, marginTop: 10,
    borderWidth: 1.5, borderColor: colors.light.border,
    paddingHorizontal: 14,
    color: colors.light.cassetteCream,
    backgroundColor: colors.light.background,
    fontFamily: "Inter_500Medium", fontSize: 15,
  },
  importInput: { height: 120, paddingTop: 12, textAlignVertical: "top", marginTop: 0 },
  previewRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
  previewFound: { flex: 1, color: "#7ab87a", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  previewMissing: { color: "#c07040", fontSize: 13, fontFamily: "Inter_500Medium" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalCancelBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1, borderColor: colors.light.border, alignItems: "center",
  },
  modalCancelTxt: { color: colors.light.mutedForeground, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalSubmitBtn: {
    flex: 2, paddingVertical: 12, borderRadius: 10,
    backgroundColor: colors.light.cassetteBeige, alignItems: "center",
  },
  modalSubmitTxt: { color: colors.light.cassetteDark, fontSize: 14, fontFamily: "Inter_700Bold" },
});
