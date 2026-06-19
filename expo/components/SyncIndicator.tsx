/**
 * SyncIndicator — A subtle animated status bar that sits at the
 * top of the dashboard, showing the current sync state.
 *
 * States:
 *   synced  — green bar, auto-hides after 2s
 *   syncing — blue pulsing bar
 *   offline — amber bar with warning
 *   error   — red bar with message
 */
import React, { useEffect, useRef } from "react";
import { View, StyleSheet, Animated } from "react-native";
import { Cloud, CloudOff, Wifi, WifiOff, AlertTriangle } from "lucide-react-native";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { SyncStatus } from "@/lib/dataService";
import ThemedText from "@/components/ThemedText";

const STATUS_CONFIG: Record<SyncStatus, {
  bg: string;
  iconColor: string;
  label: string;
  autoHide: boolean;
}> = {
  synced: {
    bg: "#DCFCE7",
    iconColor: "#16A34A",
    label: "All changes saved",
    autoHide: true,
  },
  syncing: {
    bg: "#DBEAFE",
    iconColor: "#2563EB",
    label: "Syncing...",
    autoHide: false,
  },
  offline: {
    bg: "#FEF3C7",
    iconColor: "#D97706",
    label: "Offline — changes queued",
    autoHide: false,
  },
  error: {
    bg: "#FEE2E2",
    iconColor: "#DC2626",
    label: "Sync error — retrying",
    autoHide: false,
  },
};

export default function SyncIndicator() {
  const status = useSyncStatus();
  const config = STATUS_CONFIG[status];
  const opacity = useRef(new Animated.Value(0)).current;
  const height = useRef(new Animated.Value(0)).current;
  const prevStatus = useRef<SyncStatus>("synced");

  useEffect(() => {
    const show = status !== "synced" || prevStatus.current !== "synced";
    prevStatus.current = status;

    if (show || status === "synced") {
      // Show
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(height, {
          toValue: 36,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();

      if (config.autoHide) {
        const timer = setTimeout(() => {
          Animated.parallel([
            Animated.timing(opacity, {
              toValue: 0,
              duration: 500,
              useNativeDriver: false,
            }),
            Animated.timing(height, {
              toValue: 0,
              duration: 500,
              useNativeDriver: false,
            }),
          ]).start();
        }, 2000);
        return () => clearTimeout(timer);
      }
    } else {
      // Hide
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
        Animated.timing(height, {
          toValue: 0,
          duration: 500,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [status]);

  const Icon = status === "synced" ? Cloud
    : status === "syncing" ? Wifi
    : status === "offline" ? WifiOff
    : AlertTriangle;

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: config.bg, opacity, height },
      ]}
    >
      <View style={styles.inner}>
        <Icon size={14} color={config.iconColor} />
        <ThemedText
          style={[styles.label, { color: config.iconColor }]}
          size="small"
          weight="semibold"
        >
          {config.label}
        </ThemedText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 36,
  },
  label: {
    fontSize: 12,
  },
});
