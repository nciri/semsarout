import * as React from "react";
export interface TabItem { label: string; value: string; icon?: string; }
export interface TabsProps {
  tabs: (string | TabItem)[];
  value?: string;
  onChange?: (value: string) => void;
  style?: React.CSSProperties;
}
export function Tabs(props: TabsProps): JSX.Element;
