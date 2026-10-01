# Material Symbols Rounded (subset)

[Material Symbols](https://fonts.google.com/icons) by Google, Apache License 2.0 (`LICENSE`).
Only the icons the app uses are in `material-symbols-rounded.woff2`, so the file stays small
(about 19 KB) and the app works offline.

Icons in the subset:

```
arrow_back,close,edit,emoji_emotions,emoji_events,emoji_food_beverage,emoji_nature,emoji_symbols,favorite,group_add,logout,mood,more_vert,reply,schedule,send,sentiment_dissatisfied,thumb_up,undo
```

## Adding an icon

1. Find its name on https://fonts.google.com/icons.
2. Add it to the list above, keeping it alphabetically sorted (Google rejects unsorted lists).
3. Re-download the font:

   ```bash
   N="<the list above>"
   URL=$(curl -sS -A "Mozilla/5.0 Chrome/120" \
     "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0&icon_names=$N&display=block" \
     | grep -o 'https://fonts.gstatic.com[^)]*')
   curl -sS -o material-symbols-rounded.woff2 "$URL"
   ```

4. Use it with `Icon.create("name")` (`js/icons.js`) or
   `<span class="icon" aria-hidden="true">name</span>` in HTML.
