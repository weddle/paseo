import { memo, useMemo, type ReactNode } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { CircleAlert, Clock3 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { SteerQueuedDeliveryState } from "@/types/stream";
import { formatMessageTimestamp } from "@/utils/time";

interface SteerQueuedCardProps {
  text: string;
  timestamp: number;
  deliveryState: SteerQueuedDeliveryState;
}

const ThemedActivityIndicator = withUnistyles(ActivityIndicator);
const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedClock3 = withUnistyles(Clock3);
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

export const SteerQueuedCard = memo(function SteerQueuedCard({
  text,
  timestamp,
  deliveryState,
}: SteerQueuedCardProps) {
  const { t } = useTranslation();
  let statusLabel: string;
  let statusIndicator: ReactNode;
  switch (deliveryState) {
    case "dispatching":
      statusLabel = t("composer.steerQueue.dispatching");
      statusIndicator = <ThemedActivityIndicator size="small" uniProps={mutedColorMapping} />;
      break;
    case "queued":
      statusLabel = t("composer.steerQueue.queued");
      statusIndicator = <ThemedClock3 size={16} uniProps={mutedColorMapping} />;
      break;
    case "unconfirmed":
      statusLabel = t("composer.steerQueue.unconfirmed");
      statusIndicator = <ThemedCircleAlert size={16} uniProps={warningColorMapping} />;
      break;
  }
  const timestampLabel = useMemo(() => formatMessageTimestamp(new Date(timestamp)), [timestamp]);

  return (
    <View
      style={[styles.container, deliveryState === "unconfirmed" && styles.containerUnconfirmed]}
      testID={`steer-queued-card-${deliveryState}`}
    >
      <View style={styles.header}>
        {statusIndicator}
        <Text style={[styles.status, deliveryState === "unconfirmed" && styles.statusUnconfirmed]}>
          {statusLabel}
        </Text>
        <Text style={styles.timestamp}>{timestampLabel}</Text>
      </View>
      <Text selectable style={styles.message}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  containerUnconfirmed: {
    borderColor: theme.colors.statusWarning,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  status: {
    color: theme.colors.foregroundMuted,
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  statusUnconfirmed: {
    color: theme.colors.statusWarning,
  },
  timestamp: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  message: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: theme.fontSize.sm * 1.45,
  },
}));
