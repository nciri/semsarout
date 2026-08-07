import * as React from "react";
export interface PriceTagProps {
  amount?: number;
  currency?: string;
  period?: string;
  size?: "sm" | "md" | "lg";
  style?: React.CSSProperties;
}
export function PriceTag(props: PriceTagProps): JSX.Element;
