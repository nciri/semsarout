import * as React from "react";
export interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  icon?: string;
  selected?: boolean;
  onClick?: () => void;
}
export function Chip(props: ChipProps): JSX.Element;
