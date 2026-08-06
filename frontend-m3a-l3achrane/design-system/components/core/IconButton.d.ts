import * as React from "react";
export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string;
  /** Accessible label (aria-label). */
  label: string;
  variant?: "ghost" | "soft" | "outline" | "navy";
  size?: "sm" | "md" | "lg";
  round?: boolean;
}
export function IconButton(props: IconButtonProps): JSX.Element;
