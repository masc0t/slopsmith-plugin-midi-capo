# Slopsmith Plugin: Virtual Capo

A plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that sends MIDI CC messages to your Fractal Audio modeler, automatically setting the Virtual Capo pitch shift to match each song's tuning during playback.

## Features

- **Auto-detect MIDI devices** — uses the Web MIDI API to find connected USB MIDI devices
- **Automatic tuning detection** — reads the song's tuning and calculates the correct semitone shift, with CentOffset (virtual capo) correction for CDLCs that use it
- **Arrangement-aware** — responds to the currently selected path (Lead, Rhythm, Bass) and re-fetches tuning on arrangement change
- **Standard & Drop tuning support** — handles E Standard, D Standard, Drop D, Drop C, 7-string, and more
- **Configurable CC & channel** — route to any MIDI channel and CC number to match your Fractal setup
- **Player bar badge** — shows the current shift with tuning type indicator (e.g. "Drop -7" or "Standard -2"); click to disengage/re-engage the capo on the fly
- **Device reconnect** — automatically re-sends the last shift if your USB MIDI device disconnects and reconnects mid-song
- **Test button** — send a pitch shift manually to verify your connection
- **Center on startup** — sends CC 64 (0 shift) on initialization so the Virtual Capo starts neutral
- **Auto-save** — settings persist in localStorage, saved automatically on change

## What's New

### v1.1
- **CentOffset fix** — CDLCs that use virtual capo encoding (positive tuning offsets with a negative CentOffset) now resolve to the correct pitch shift instead of shifting the wrong direction
- **Arrangement-aware** — tuning now follows the active arrangement path (Lead, Rhythm, Bass) and updates automatically when you switch
- **Drop/Standard badge** — the player button now shows "Drop -7" or "Standard -2" so you know at a glance whether to be in Drop D or E Standard
- **Parallel fetch** — tuning is fetched alongside song loading instead of after, so the MIDI CC is sent faster
- **LRU cache** — parsed PSARC tunings are cached in memory so arrangement switches and replays are instant

## Compatible Devices

Designed for Fractal Audio units with a Virtual Capo Pitch block:

- Fractal Axe-FX III / FM9 (USB MIDI)
- Fractal FM3 (5-pin MIDI only — does **not** support MIDI-over-USB, use a USB MIDI interface like a MIDI Sport)

May also work with other modelers that accept MIDI CC to control pitch shifting.

## Requirements

- **Chrome or Edge browser** (Firefox does not support Web MIDI)
- A USB MIDI device visible to the browser — either the modeler directly via USB, or a USB MIDI interface (e.g. MIDI Sport, Zoom U-44) connected to the Fractal's 5-pin MIDI IN

## Installation

```bash
cd /path/to/slopsmith/plugins
git clone https://github.com/masc0t/slopsmith-plugin-midi-capo.git midi_capo
docker compose restart
```

## How It Works

1. Connect your Fractal unit via USB MIDI
2. Go to "Capo" in the navigation
3. The plugin detects your MIDI device and sends a center value (0 shift)
4. When a song loads, the plugin extracts tuning offsets from the PSARC (with CentOffset correction) for the active arrangement and calculates the semitone shift
5. The corresponding CC value is sent automatically to your MIDI device — tuning is fetched in parallel with song loading for minimal delay
6. Use the "Test" button to manually send a shift and verify the correct pitch change on your device

> **Note:** The plugin includes a server-side route (`routes.py`) that reads tuning data directly from PSARC files, so it works without any modifications to the Slopsmith core.

### Fractal Setup

1. **MIDI/Remote** — Go to Setup > MIDI/Remote > External. Set **External Control 1** to CC #18.
2. **Pitch Block** — Place a Pitch block in your preset. Change **Type** to **Virtual Capo**.
3. **Modifier** — Edit the Modifier for **Shift**. Set **Source 1** to **External 1**.

### Supported Tunings

| Pattern | Example | Shift |
|---------|---------|-------|
| Standard (all strings same offset) | E Standard, D Standard, C# Standard | Offset value (0, -2, -3, ...) |
| Drop (string 0 is 2 below string 1) | Drop D, Drop C, Drop B | String 1 offset |
| 7-string standard | B Standard 7-string | String 1 offset |

Unknown tuning shapes default to shift 0 (no change).


## Engaged <img width="2005" height="1364" alt="capo on" src="https://github.com/user-attachments/assets/cdd4532e-3be6-4bfa-9cb8-521f595c8f8f" />
## Bypassed <img width="2004" height="1363" alt="capo off" src="https://github.com/user-attachments/assets/e8e0ed8e-ba0f-433b-9cf9-8eed7307043c" />


## Other Plugins

- [Find More Songs](https://github.com/masc0t/slopsmith-plugin-find-more) — search CustomsForge for more songs by an artist and find more songs to add to your collection
- [Invert Highway](https://github.com/masc0t/slopsmith-plugin-invert-highway) — flip the chord note stacking order on the highway

## License

MIT
