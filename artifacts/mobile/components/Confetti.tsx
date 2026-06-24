import React, { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, Platform, StyleSheet, View } from "react-native";

const COLORS = ["#6366f1", "#f97316", "#16a34a", "#ef4444", "#eab308", "#ec4899"];
const PIECE_COUNT = 60;

type PieceProps = { delay: number; startX: number; color: string; size: number; fallTo: number };

function Piece({ delay, startX, color, size, fallTo }: PieceProps) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 2200 + Math.random() * 1200,
      delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: Platform.OS !== "web",
    });
    anim.start();
    return () => anim.stop();
  }, [progress, delay]);

  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [-40, fallTo] });
  const translateX = progress.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 140],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${360 + Math.random() * 540}deg`],
  });
  const opacity = progress.interpolate({ inputRange: [0, 0.85, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      style={{
        position: "absolute",
        left: startX,
        top: 0,
        width: size,
        height: size * 0.6,
        backgroundColor: color,
        borderRadius: 2,
        opacity,
        transform: [{ translateY }, { translateX }, { rotate }],
      }}
    />
  );
}

export default function Confetti({ run }: { run: boolean }) {
  const { width, height } = Dimensions.get("window");
  const pieces = useRef(
    Array.from({ length: PIECE_COUNT }).map((_, i) => ({
      key: i,
      delay: Math.random() * 600,
      startX: Math.random() * width,
      color: COLORS[i % COLORS.length],
      size: 8 + Math.random() * 8,
      fallTo: height * (0.7 + Math.random() * 0.35),
    })),
  ).current;

  if (!run) return null;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p) => (
        <Piece key={p.key} delay={p.delay} startX={p.startX} color={p.color} size={p.size} fallTo={p.fallTo} />
      ))}
    </View>
  );
}
