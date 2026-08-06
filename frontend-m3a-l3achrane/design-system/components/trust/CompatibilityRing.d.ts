import * as React from "react";
/**
 * Animated circular compatibility gauge.
 * @startingPoint section="Trust" subtitle="Compatibility score ring" viewport="700x240"
 */
export interface CompatibilityRingProps {
  value?: number;
  size?: number;
  stroke?: number;
  label?: string;
  style?: React.CSSProperties;
}
export function CompatibilityRing(props: CompatibilityRingProps): JSX.Element;
