import React from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, Pattern, Rect } from "react-native-svg";
import { brand } from "./theme";

export interface PaperProps {
  opacity?: number;
}

export function Paper({ opacity = brand.texture.opacity }: PaperProps) {
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="grain" x="0" y="0" width="7" height="7" patternUnits="userSpaceOnUse">
            <Circle cx="1" cy="1" r="0.6" fill={brand.texture.tint} opacity={0.18} />
            <Circle cx="4.5" cy="3.2" r="0.5" fill={brand.texture.tint} opacity={0.12} />
            <Circle cx="2.4" cy="5.6" r="0.45" fill={brand.texture.tint} opacity={0.1} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#grain)" />
      </Svg>
    </View>
  );
}

export default Paper;
