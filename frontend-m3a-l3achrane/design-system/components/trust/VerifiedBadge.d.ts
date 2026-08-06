import * as React from "react";
export interface VerifiedBadgeProps {
  label?: string;
  level?: "full" | "partial" | "none";
  size?: "sm" | "md";
  style?: React.CSSProperties;
}
export function VerifiedBadge(props: VerifiedBadgeProps): JSX.Element;
