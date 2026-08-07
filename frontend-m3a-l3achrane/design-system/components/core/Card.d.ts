import * as React from "react";
export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: number | string;
  /** Lift + deepen shadow on hover. */
  hover?: boolean;
  radius?: string;
}
export function Card(props: CardProps): JSX.Element;
