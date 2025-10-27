# PoB HTTP Server — Chrome Extension

This repository hosts a Chrome extension that sends selected item text to a local **Path of Building (PoB) HTTP server** to calculate item impact.  
It also supports **rune overrides**, **socket adjustments**, and now a **preview box for the selected amulet enchant** (added or replacing an existing one).

## Features
- Apply runes and (optionally) add missing sockets before sending the item to PoB.
- Pick an **amulet enchant**; the extension edits the item text accordingly.
- **Enchant preview box**: shows the applied enchant and whether it was *added* or *replaced existing*.
- One-click “Item Impact” request to the local PoB HTTP server.

## Quick start (development)
1. Clone the repo:
   ```bash
   git clone https://github.com/YOUR-USER/YOUR-REPO.git
   cd YOUR-REPO
   ```
2. Load the extension into Chrome (Developer Mode):
   - Open `chrome://extensions`
   - Toggle **Developer mode** (top-right)
   - Click **Load unpacked** and select the folder that contains `manifest.json`
3. Open the target site and use the extension panel.  
   If you’re running a local PoB HTTP server, enter its URL/share code and hit **Load PoB**.

## Building a zip for release
You can create a distributable zip containing the extension files (the folder with `manifest.json`):
```bash
bash tools/pack.sh
```
The zip will be placed under `dist/`.

GitHub Actions also does this for you when you push a new tag (see `.github/workflows/release.yml`).

## File of interest
- `extension/js/trade.js` — main content script/controller.  
  The enchant preview box is built from the return of:
  ```js
  const res = applyEnchantOverride(itemTextAfter);
  // res = \{ text, appliedText, mode: 'added' | 'overridden' \}
  ```
  and appended to the existing rune preview (`set_rune_preview` message).

## Contributing
PRs are welcome! Please keep user-facing strings friendly and dark-theme friendly.

## License
MIT — see [LICENSE](LICENSE).
