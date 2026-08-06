import * as React from "react";
export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: "neutral" | "verified" | "info" | "warning" | "danger" | "gold" | "navy" | "solidNavy" | "solidGreen";
  icon?: string;
  size?: "sm" | "md";
}
export function Badge(props: BadgeProps): JSX.Element;
