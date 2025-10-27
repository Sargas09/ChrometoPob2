# PoB HTTP Server — Chrome Extension (PoE2)

> Inspired by the idea of [unremem/PoBTradeHelper](https://github.com/unremem/PoBTradeHelper).  
> **This project targets Path of Exile 2 and is not compatible with the original PoE1 tool.**

This Chrome extension sends an item you select on <https://www.pathofexile.com/trade2> to a local **Path of Building (PoE2) HTTP server** and shows its **item impact**. It also supports:

- **Rune overrides**
- **Socket adjustments**
- **Amulet enchants** (with preview)

![PoE trading screenshot](example.jpg)
---

## Prerequisites

- **Windows** (uses `pywin32` underneath)
- **Path of Building Community (PoE2)** installed and at least one build saved
- **Python 3.10+** (recommended)
- Google **Chrome**

---

## Quick Start (Development)

### 1) Get the code

Clone or copy the project to a convenient folder, e.g.:

```
C:\ChrometoPob2
```

### 2) Configure server paths

Edit `C:\ChrometoPob2\server\app.py` and update the following paths. Replace `username` with your Windows user name.

```python
# Path of Building installation (PoE2)
POB_INSTALL = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)"
POB_PATH    = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)"

# A PoB build file to load by default (change to any saved build you have)
HARDCODED_BUILD = r"C:\Users\username\Documents\Path of Building (PoE2)\Builds\1\Shockburster Deadeye.xml"

# Paths to PoB data files
MOD_RUNES_PATH    = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)\Data\ModRunes.lua"
MOD_ENCHANTS_PATH = r"C:\Users\username\AppData\Roaming\Path of Building Community (PoE2)\Data\QueryMods.lua"

# Where this repo lives on your drive
USER_POB_WRAPPER = r"C:\ChrometoPob2"
```

Make sure the directories and files exist on your machine.

### 3) Start the HTTP server

Open a terminal and run:

```
C:\ChrometoPob2\server\run.bat
```

On first run, it will create a virtual environment and install dependencies. You should then see Uvicorn start, e.g.:

```
INFO:     Will watch for changes in these directories: ['C:\ChrometoPob2\server']
INFO:     Uvicorn running on http://127.0.0.1:5000 (Press CTRL+C to quit)
INFO:     Started reloader process [8292] using StatReload
INFO:     Started server process [16612]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### 4) Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the folder that contains `manifest.json`, usually:  
   `C:\ChrometoPob2\extension`

### 5) Use it

Open <https://www.pathofexile.com/trade2>, select an item, and use the extension panel to send the item to the local PoB server. The panel will show runes, sockets, the amulet enchant preview, and the calculated impact.

---

## Troubleshooting

- **Server won’t start / missing files**: Double‑check the paths in `server/app.py`.
- **Cannot connect from the extension**: Ensure the server is running on `http://127.0.0.1:5000` and not blocked by a firewall.
- **PoB not detected**: Verify your PoB installation path and that your build file exists.
- **Windows-only**: The server uses `pywin32`, so it currently targets Windows.

---

## License

MIT — see [LICENSE](./LICENSE).

## Credits

- Based on the idea of [unremem/PoBTradeHelper](https://github.com/unremem/PoBTradeHelper). Thanks for the inspiration!
