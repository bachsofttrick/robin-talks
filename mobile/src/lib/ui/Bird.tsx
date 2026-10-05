import React from "react";
import Svg, { Path } from "react-native-svg";
import { colors } from "./theme";

export interface BirdProps {
  size?: number;
  color?: string;
}

export function Bird({ size = 20, color = colors.accent }: BirdProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M4 17c4.2 0 7.3-1.6 9.3-4.2 1.3-1.7 1.8-3.5 1.6-5.3l2.7 1.2 2.4-1.5-1.1 3 1.1.7-2.2 1c-.6 4.6-4.4 8.1-9.6 8.1-1.6 0-3.1-.3-4.2-1 1.7-.1 2.9-.6 3.7-1.4-1.6-.1-2.8-.6-3.7-1.6z"
        fill={color}
      />
    </Svg>
  );
}

export default Bird;
