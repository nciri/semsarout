import * as React from "react";
export interface FeatureItemProps {
  icon?: string;
  title: string;
  subtitle?: string;
  layout?: "row" | "col";
  tone?: "navy" | "green" | "gold";
  style?: React.CSSProperties;
}
export function FeatureItem(props: FeatureItemProps): JSX.Element;
