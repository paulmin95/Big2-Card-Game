import { Feather } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';

export function PlayerSeat({
  name,
  cards,
  active,
  isHuman,
  width,
  testID,
}: {
  name: string;
  cards: number;
  active: boolean;
  isHuman: boolean;
  width: number;
  testID: string;
}) {
  const colors = useColors();
  const compact = width < 82;
  const pulse = useSharedValue(0);
  const haloStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
    transform: [{ scale: 0.92 + pulse.value * 0.12 }],
  }));

  useEffect(() => {
    cancelAnimation(pulse);
    if (active) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.72, { duration: 500 }),
          withTiming(0.22, { duration: 650 }),
        ),
        -1,
        false,
      );
    } else {
      pulse.value = withTiming(0, { duration: 160 });
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse]);

  return (
    <View
      accessibilityLabel={`${name}, ${cards} cards${active ? ', taking turn' : ''}`}
      testID={testID}
      style={[
        styles.seat,
        {
          width,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? '#214838' : '#13271F',
        },
        active && Platform.OS !== 'web' ? styles.activeElevation : null,
      ]}
    >
      <Animated.View
        style={[
          styles.halo,
          { pointerEvents: 'none', borderColor: colors.primary },
          haloStyle,
        ]}
      />
      <View style={styles.nameRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.name,
            {
              color: active ? colors.primary : colors.mutedForeground,
              fontSize: compact ? 7 : 8,
            },
          ]}
        >
          {name.toUpperCase()}
        </Text>
        {!compact && (
          <Feather
            name={isHuman ? 'user' : 'cpu'}
            size={11}
            color={active ? colors.primary : colors.mutedForeground}
          />
        )}
      </View>
      <View style={styles.countRow}>
        <Text style={[styles.count, { color: colors.foreground }]}>{cards}</Text>
        <Text style={[styles.countLabel, { color: colors.mutedForeground }]}>cards</Text>
      </View>
      {active && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  seat: {
    minHeight: 61,
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 9,
    paddingVertical: 8,
    justifyContent: 'center',
    zIndex: 2,
  },
  halo: {
    position: 'absolute',
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderWidth: 1.5,
    borderRadius: 19,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 0 10px rgba(215, 180, 106, 0.36)' }
      : { shadowColor: '#D7B46A', shadowOpacity: 0.48, shadowRadius: 9 }),
  },
  activeElevation: {
    elevation: 8,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
  },
  name: {
    flexShrink: 1,
    fontFamily: 'Inter_700Bold',
    fontSize: 8,
    letterSpacing: 0.7,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 4,
  },
  count: {
    fontFamily: 'Inter_700Bold',
    fontSize: 17,
  },
  countLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 8,
  },
  activeDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    right: 7,
    bottom: 7,
  },
});