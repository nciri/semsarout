import * as React from "react";
export interface SelectOption { label: string; value: string; }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  icon?: string;
  options: (string | SelectOption)[];
  containerStyle?: React.CSSProperties;
}
export function Select(props: SelectProps): JSX.Element;
