import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import React, { useCallback, useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdaptiveModalSheet, type SheetHeader } from "@/components/adaptive-modal-sheet";
import { useDismissKeyboardOnOpen } from "@/components/ui/keyboard-dismiss";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { SendBehavior } from "./state";

export interface SendBehaviorLabels {
  choose: string;
  title: string;
  steer: string;
  steerDescription: string;
  steerUnavailableWithAttachments: string;
  queue: string;
  queueDescription: string;
  interrupt: string;
  interruptDescription: string;
}

export interface SendBehaviorOption {
  behavior: SendBehavior;
  label: string;
  description: string;
  disabled: boolean;
}

export function resolveSendBehaviorOptions(input: {
  canSteer: boolean;
  hasAttachments: boolean;
  labels: SendBehaviorLabels;
}): SendBehaviorOption[] {
  const options: SendBehaviorOption[] = [];
  if (input.canSteer) {
    options.push({
      behavior: "steer",
      label: input.labels.steer,
      description: input.hasAttachments
        ? input.labels.steerUnavailableWithAttachments
        : input.labels.steerDescription,
      disabled: input.hasAttachments,
    });
  }
  options.push(
    {
      behavior: "queue",
      label: input.labels.queue,
      description: input.labels.queueDescription,
      disabled: false,
    },
    {
      behavior: "interrupt",
      label: input.labels.interrupt,
      description: input.labels.interruptDescription,
      disabled: false,
    },
  );
  return options;
}

function SendBehaviorSheetItem({
  option,
  selected,
  onSelect,
}: {
  option: SendBehaviorOption;
  selected: boolean;
  onSelect: (behavior: SendBehavior) => void;
}) {
  const handlePress = useCallback(() => {
    if (!option.disabled) onSelect(option.behavior);
  }, [onSelect, option.behavior, option.disabled]);
  const accessibilityState = useMemo(
    () => ({ disabled: option.disabled, selected }),
    [option.disabled, selected],
  );
  const sheetItemStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.sheetItem,
      pressed && !option.disabled && styles.sheetItemPressed,
      option.disabled && styles.sheetItemDisabled,
    ],
    [option.disabled],
  );

  return (
    <Pressable
      testID={`message-input-send-behavior-option-${option.behavior}`}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      disabled={option.disabled}
      onPress={handlePress}
      style={sheetItemStyle}
    >
      <View style={styles.sheetItemContent}>
        <Text style={styles.sheetItemLabel}>{option.label}</Text>
        <Text style={styles.sheetItemDescription}>{option.description}</Text>
      </View>
      {selected ? <ThemedCheck size={16} uniProps={iconForegroundMapping} /> : null}
    </Pressable>
  );
}

function SendBehaviorSheetList({
  options,
  selectedBehavior,
  onSelect,
}: {
  options: readonly SendBehaviorOption[];
  selectedBehavior: SendBehavior;
  onSelect: (behavior: SendBehavior) => void;
}) {
  return (
    <View style={styles.sheetList}>
      {options.map((option) => (
        <SendBehaviorSheetItem
          key={option.behavior}
          option={option}
          selected={option.behavior === selectedBehavior}
          onSelect={onSelect}
        />
      ))}
    </View>
  );
}

function SendBehaviorDropdownItem({
  option,
  selected,
  onSelect,
}: {
  option: SendBehaviorOption;
  selected: boolean;
  onSelect: (behavior: SendBehavior) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(option.behavior);
  }, [onSelect, option.behavior]);

  return (
    <DropdownMenuItem
      testID={`message-input-send-behavior-option-${option.behavior}`}
      description={option.description}
      disabled={option.disabled}
      selected={selected}
      onSelect={handleSelect}
    >
      {option.label}
    </DropdownMenuItem>
  );
}

export function SendBehaviorControl({
  canSteer,
  hasAttachments,
  selectedBehavior,
  disabled = false,
  labels,
  onSelect,
}: {
  canSteer: boolean;
  hasAttachments: boolean;
  selectedBehavior: SendBehavior;
  disabled?: boolean;
  labels: SendBehaviorLabels;
  onSelect: (behavior: SendBehavior) => void;
}) {
  const isCompact = useIsCompactFormFactor();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  useDismissKeyboardOnOpen(isSheetOpen, isCompact);
  const options = useMemo(
    () => resolveSendBehaviorOptions({ canSteer, hasAttachments, labels }),
    [canSteer, hasAttachments, labels],
  );
  const selectedOption =
    options.find((option) => option.behavior === selectedBehavior) ?? options[0];
  const sheetHeader = useMemo<SheetHeader>(() => ({ title: labels.title }), [labels.title]);
  const triggerAccessibilityLabel = `${labels.choose}: ${selectedOption?.label ?? labels.interrupt}`;

  const handleOpenSheet = useCallback(() => {
    if (!disabled) setIsSheetOpen(true);
  }, [disabled]);
  const handleCloseSheet = useCallback(() => {
    setIsSheetOpen(false);
  }, []);
  const handleSheetSelect = useCallback(
    (behavior: SendBehavior) => {
      setIsSheetOpen(false);
      onSelect(behavior);
    },
    [onSelect],
  );
  const triggerStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.trigger,
      pressed && !disabled && styles.triggerPressed,
      disabled && styles.triggerDisabled,
    ],
    [disabled],
  );

  if (!canSteer) return null;

  if (isCompact) {
    return (
      <>
        <Pressable
          testID="message-input-send-behavior-trigger"
          accessibilityRole="button"
          accessibilityLabel={triggerAccessibilityLabel}
          disabled={disabled}
          onPress={handleOpenSheet}
          style={triggerStyle}
        >
          <Text numberOfLines={1} style={styles.triggerText}>
            {selectedOption?.label}
          </Text>
          <ThemedChevronDown size={14} uniProps={iconForegroundMutedMapping} />
        </Pressable>
        <AdaptiveModalSheet
          header={sheetHeader}
          visible={isSheetOpen}
          onClose={handleCloseSheet}
          snapPoints={["34%", "45%"]}
          testID="message-input-send-behavior-menu"
        >
          <SendBehaviorSheetList
            options={options}
            selectedBehavior={selectedBehavior}
            onSelect={handleSheetSelect}
          />
        </AdaptiveModalSheet>
      </>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID="message-input-send-behavior-trigger"
        accessibilityRole="button"
        accessibilityLabel={triggerAccessibilityLabel}
        disabled={disabled}
        style={styles.trigger}
      >
        <Text numberOfLines={1} style={styles.triggerText}>
          {selectedOption?.label}
        </Text>
        <ThemedChevronDown size={14} uniProps={iconForegroundMutedMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        offset={8}
        minWidth={272}
        testID="message-input-send-behavior-menu"
      >
        {options.map((option) => (
          <SendBehaviorDropdownItem
            key={option.behavior}
            option={option}
            selected={option.behavior === selectedBehavior}
            onSelect={onSelect}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  trigger: {
    minWidth: 72,
    height: 28,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
  },
  triggerPressed: {
    backgroundColor: theme.colors.surface2,
  },
  triggerDisabled: {
    opacity: 0.5,
  },
  triggerText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  sheetList: {
    gap: theme.spacing[1],
  },
  sheetItem: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.xl,
  },
  sheetItemPressed: {
    backgroundColor: theme.colors.surface2,
  },
  sheetItemDisabled: {
    opacity: 0.5,
  },
  sheetItemContent: {
    flex: 1,
    gap: theme.spacing[1],
  },
  sheetItemLabel: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  sheetItemDescription: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.35,
  },
})) as unknown as Record<string, object>;

const ThemedCheck = withUnistyles(Check);
const ThemedChevronDown = withUnistyles(ChevronDown);

const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
