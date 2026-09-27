import { useEffect, useState } from "react";
import { Animated } from "react-native";
import { brand } from "./theme";

export function useEnter(delay = 0) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: brand.motion.enter,
      delay,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [delay, progress]);
  return {
    opacity: progress,
    transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  };
}

export function useStagger(index: number) {
  return useEnter(Math.min(index, 8) * brand.motion.stagger);
}

export function usePress() {
  const [value] = useState(() => new Animated.Value(1));
  const to = (toValue: number) =>
    Animated.timing(value, { toValue, duration: 110, useNativeDriver: true }).start();
  return {
    onPressIn: () => to(brand.motion.press.scale),
    onPressOut: () => to(1),
    style: { transform: [{ scale: value }] },
  };
}
