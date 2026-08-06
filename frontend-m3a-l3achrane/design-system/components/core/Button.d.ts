import * as React from "react";
/**
 * Primary action control in navy, with a gold accent variant for the single
 * highest-intent action per view (S'inscrire, Rechercher).
 * @startingPoint section="Core" subtitle="Navy / gold / outline action buttons" viewport="700x160"
 */
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "accent" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  /** Lucide icon name shown before the label. */
  iconLeft?: string;
  /** Lucide icon name shown after the label. */
  iconRight?: string;
  fullWidth?: boolean;
}
export function Button(props: ButtonProps): JSX.Element;
