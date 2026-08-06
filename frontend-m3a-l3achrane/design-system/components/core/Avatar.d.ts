import * as React from "react";
export interface AvatarProps {
  src?: string;
  name: string;
  size?: number;
  /** Green check overlay for identity-verified users. */
  verified?: boolean;
  /** Show name + subtitle beside the circle. */
  showLabel?: boolean;
  subtitle?: string;
  style?: React.CSSProperties;
}
export function Avatar(props: AvatarProps): JSX.Element;
