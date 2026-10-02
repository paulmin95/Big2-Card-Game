import React, { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const ORIGINS = [
  { x: 0, y: 112 },
  { x: -118, y: 0 },
  { x: 0, y: -118 },
  { x: 118, y: 0 },
];

export function PlayedHandMotion({
  player,
  playId,
  children,
}: {
  player: number;
  playId: number;
  children: React.ReactNode;
}) {
  const origin = ORIGINS[player] ?? ORIGINS[0]!;
  const x = useSharedValue(origin.x);
  const y = useSharedValue(origin.y);
  const scale = useSharedValue(0.92);
  const opacity = useSharedValue(0);
  const motionStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateX: x.value },
      { translateY: y.value },
      { scale: scale.value },
    ],
  }));

  useEffect(() => {
    const start = ORIGINS[player] ?? ORIGINS[0]!;
    x.value = start.x;
    y.value = start.y;
    scale.value = 0.92;
    opacity.value = 0;
    x.value = withSpring(0, { damping: 14, stiffness: 125, mass: 0.75 });
    y.value = withSpring(0, { damping: 14, stiffness: 125, mass: 0.75 });
    scale.value = withSequence(
      withSpring(1.025, { damping: 10, stiffness: 150 }),
      withSpring(1, { damping: 13, stiffness: 145 }),
    );
    opacity.value = withTiming(1, { duration: 180 });
  }, [opacity, playId, player, scale, x, y]);

  return <Animated.View style={motionStyle}>{children}</Animated.View>;
}