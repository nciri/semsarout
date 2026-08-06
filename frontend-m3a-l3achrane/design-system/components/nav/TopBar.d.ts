import * as React from "react";
export interface TopBarProps {
  links?: string[];
  lang?: string;
  onSignIn?: () => void;
  onSignUp?: () => void;
  style?: React.CSSProperties;
}
export function TopBar(props: TopBarProps): JSX.Element;
