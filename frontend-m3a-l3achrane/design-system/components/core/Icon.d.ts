import * as React from "react";
export interface IconProps extends React.HTMLAttributes<HTMLElement> {
  /** Lucide icon name, e.g. "shield-check", "home", "map-pin". */
  name: string;
  size?: number;
  strokeWidth?: number;
  color?: string;
}
export function Icon(props: IconProps): JSX.Element;
