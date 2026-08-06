import * as React from "react";
export interface SidebarItem { icon: string; label: string; value: string; badge?: number; }
export interface SidebarNavProps {
  items?: SidebarItem[];
  active?: string;
  onSelect?: (value: string) => void;
  width?: number;
  style?: React.CSSProperties;
}
export function SidebarNav(props: SidebarNavProps): JSX.Element;
