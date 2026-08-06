Fixed navy app sidebar (dashboard shell): brand, nav items with badges, help footer.

```jsx
<SidebarNav active="dash" onSelect={setView} />
```
Pass your own `items`; each `{icon,label,value,badge?}`.
