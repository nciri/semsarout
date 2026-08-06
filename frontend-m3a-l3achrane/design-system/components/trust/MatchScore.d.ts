import * as React from "react";
export interface MatchScoreProps {
  /** 0–100. ≥80 green, ≥60 gold, below grey. */
  value?: number;
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
export function MatchScore(props: MatchScoreProps): JSX.Element;
