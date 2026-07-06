import React, { useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity, StyleSheet,
  Platform, KeyboardAvoidingView, ActivityIndicator,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/Icon";
import colors from "@/constants/colors";
import type { Side } from "@/hooks/useAudioPlayer";

interface AddUrlModalProps {
  visible: boolean;
  side: Side;
  isAdding: boolean;
  onAdd: (url: string, side: Side, title?: string) => Promise<void>;
  onClose: () => void;
}

export function AddUrlModal({ visible, side, isAdding, onAdd, onClose }: AddUrlModalProps) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const sideColor = side === "A" ? "#9e3c3c" : "#2b5499";

  const isYouTube = /(?:youtube\.com|youtu\.be)/.test(url);
  const canSubmit = url.trim().length > 0 && !isAdding;

  const handleAdd = async () => {
    if (!canSubmit) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onAdd(url.trim(), side, title.trim() || undefined);
    setUrl("");
    setTitle("");
    onClose();
  };

  const handleClose = () => {
    setUrl("");
    setTitle("");
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.titleRow}>
            <Icon name="link" size={18} color={sideColor} />
            <Text style={styles.title}>Add URL to Side {side}</Text>
          </View>

          <Text style={styles.label}>URL</Text>
          <TextInput
            style={styles.input}
            placeholder="YouTube or direct audio URL…"
            placeholderTextColor={colors.light.mutedForeground}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          {isYouTube && (
            <View style={styles.badge}>
              <Icon name="youtube" size={13} color="#ff3b30" />
              <Text style={styles.badgeText}>YouTube detected — title will be fetched automatically</Text>
            </View>
          )}

          <Text style={[styles.label, { marginTop: 12 }]}>Title (optional)</Text>
          <TextInput
            style={styles.input}
            placeholder={isYouTube ? "Auto-fetched from YouTube…" : "Custom title…"}
            placeholderTextColor={colors.light.mutedForeground}
            value={title}
            onChangeText={setTitle}
          />

          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: sideColor }, !canSubmit && styles.addBtnDisabled]}
              onPress={handleAdd}
              disabled={!canSubmit}
              activeOpacity={0.8}
            >
              {isAdding ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Icon name="plus" size={16} color="#fff" />
                  <Text style={styles.addText}>Add Track</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    backgroundColor: colors.light.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.light.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: colors.light.cassetteBeige,
    letterSpacing: 0.5,
  },
  label: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.mutedForeground,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.light.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: colors.light.cassetteBeige,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: 8,
    backgroundColor: "rgba(255,59,48,0.08)",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,59,48,0.2)",
  },
  badgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    color: colors.light.mutedForeground,
    flex: 1,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.light.border,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    color: colors.light.mutedForeground,
  },
  addBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addBtnDisabled: {
    opacity: 0.4,
  },
  addText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 0.5,
  },
});
