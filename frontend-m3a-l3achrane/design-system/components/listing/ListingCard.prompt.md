The signature marketplace card — photo, match score, verified badge, title, city, price, amenities.

```jsx
<ListingCard match={85} title="Chambre dans un F4" city="Maârif, Casablanca" price={2300}
  amenities={[{icon:"users",label:"3 colocs"},{icon:"volume-x",label:"Calme"}]} onClick={open} />
```
Composes MatchScore, VerifiedBadge, PriceTag, AmenityChip. Pass `image` for a real photo.
