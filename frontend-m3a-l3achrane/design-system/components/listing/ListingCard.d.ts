import * as React from "react";
export interface Amenity { icon: string; label: string; }
/**
 * The core marketplace card: photo with floating match score + verified badge,
 * title, location, price and amenity chips.
 * @startingPoint section="Listing" subtitle="Marketplace listing card" viewport="360x340"
 */
export interface ListingCardProps {
  image?: string;
  imageTone?: string;
  match?: number;
  verified?: boolean;
  title?: string;
  city?: string;
  price?: number;
  amenities?: Amenity[];
  onClick?: () => void;
  style?: React.CSSProperties;
}
export function ListingCard(props: ListingCardProps): JSX.Element;
