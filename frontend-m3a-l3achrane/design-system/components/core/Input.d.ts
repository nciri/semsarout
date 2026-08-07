import * as React from "react";
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  /** Leading Lucide icon name. */
  icon?: string;
  hint?: string;
  error?: string;
  containerStyle?: React.CSSProperties;
}
export function Input(props: InputProps): JSX.Element;
