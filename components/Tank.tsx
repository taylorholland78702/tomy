import React from 'react';
import Svg, { Rect, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  width: number;
  height: number;
  /** Phase 9 Level 27's finale: an HSL hue (0-360) tinting the tank as the combo climbs, via a
   *  third additive overlay rather than rewriting the water gradient's own stops. Undefined = no
   *  tint overlay, i.e. every level except Level 27. */
  tintHue?: number;
}

/** Clear acrylic water-tank background with a glossy top highlight. */
export function Tank({ width, height, tintHue }: Props) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      <Defs>
        <LinearGradient id="water" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#8FF0FF" stopOpacity={0.55} />
          <Stop offset="0.4" stopColor="#39C4F0" stopOpacity={0.55} />
          <Stop offset="1" stopColor="#0B5C8A" stopOpacity={0.8} />
        </LinearGradient>
        <LinearGradient id="gloss" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.35} />
          <Stop offset="0.15" stopColor="#FFFFFF" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#water)" />
      <Rect x={0} y={0} width={width} height={height} fill="url(#gloss)" />
      {tintHue !== undefined && (
        <Rect x={0} y={0} width={width} height={height} fill={`hsl(${tintHue}, 85%, 55%)`} opacity={0.16} />
      )}
    </Svg>
  );
}
