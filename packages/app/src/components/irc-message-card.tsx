import { memo } from "react";
import { Text, View } from "react-native";
import { MessageSquare } from "lucide-react-native";
import { StyleSheet } from "react-native-unistyles";
import type { IrcMessageDeliveryState } from "@getpaseo/protocol/agent-types";

interface IrcMessageCardProps {
  sender: string;
  recipient?: string;
  replyTo?: string;
  body: string;
  deliveryState: IrcMessageDeliveryState;
}
const DELIVERY_LABELS: Record<IrcMessageDeliveryState, string> = {
  delivered: "Delivered",
  failed: "Delivery failed",
  unknown: "Delivery status unknown",
};

const stylesheet = StyleSheet.create((theme) => ({
  container: {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  title: {
    color: theme.colors.foreground,
    flex: 1,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  delivery: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  route: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 16,
  },
  body: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
  },
}));

export const IrcMessageCard = memo(function IrcMessageCard({
  sender,
  recipient,
  replyTo,
  body,
  deliveryState,
}: IrcMessageCardProps) {
  const deliveryLabel = DELIVERY_LABELS[deliveryState];
  const route = [
    `From ${sender}`,
    ...(recipient ? [`To ${recipient}`] : []),
    ...(replyTo ? [`Reply to ${replyTo}`] : []),
  ].join(" · ");

  return (
    <View style={stylesheet.container} testID="irc-message-card">
      <View style={stylesheet.header}>
        <MessageSquare color="#60a5fa" size={16} />
        <Text style={stylesheet.title}>IRC message</Text>
        <Text style={stylesheet.delivery}>{deliveryLabel}</Text>
      </View>
      <Text selectable style={stylesheet.route}>
        {route}
      </Text>
      <Text selectable style={stylesheet.body}>
        {body}
      </Text>
    </View>
  );
});
