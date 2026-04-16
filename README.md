# Slopsmith Plugin: Virtual Capo

A plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that sends MIDI CC messages to your amp/modeler, automatically setting the pitch shift to match each song's tuning during playback. Supports Fractal Audio, Kemper, Line 6 Helix, Boss GT-1000, Neural DSP Quad Cortex, Headrush, and any device via Custom mode.

## Features

- **Auto-detect MIDI devices** — uses the Web MIDI API to find connected USB MIDI devices
- **Automatic tuning detection** — reads the song's tuning and calculates the correct semitone shift, with CentOffset (virtual capo) correction for CDLCs that use it
- **Arrangement-aware** — responds to the currently selected path (Lead, Rhythm, Bass) and re-fetches tuning on arrangement change
- **Standard & Drop tuning support** — handles E Standard, D Standard, Drop D, Drop C, 7-string, and more
- **Device presets** — built-in presets for Standard modelers (Fractal, Helix, Boss, etc.), Kemper, and Custom — each populates sensible defaults that you can still customize
- **Configurable CC & channel** — route to any MIDI channel and CC number to match your setup
- **Player bar badge** — shows the current shift with tuning type indicator (e.g. "Drop -7" or "Standard -2"); click to disengage/re-engage the capo on the fly
- **Device reconnect** — automatically re-sends the last shift if your USB MIDI device disconnects and reconnects mid-song
- **Test button** — send a pitch shift manually to verify your connection
- **Center on startup** — sends the center CC value (0 shift) on initialization so the pitch starts neutral
- **Auto-save** — settings persist in localStorage, saved automatically on change

## What's New

### v1.3
- **Consolidated Profiles** — Fractal, Helix, Boss, Neural DSP, and Headrush are now grouped into a single **Standard** profile to simplify setup, as they share the same parameters.

### v1.2
- **Multi-device presets** — built-in presets for Standard modelers, Kemper, and Custom — selecting a device populates defaults that you can still customize
- **Custom mode** — fully configurable shift range and CC range for any device not listed
- **Universal CC formula** — linear interpolation across each profile's CC range, replacing the Fractal-specific hardcoded formula
- **Profile-aware center** — center/zero CC value computed from profile params instead of hardcoded 64

### v1.1
- **CentOffset fix** — CDLCs that use virtual capo encoding (positive tuning offsets with a negative CentOffset) now resolve to the correct pitch shift instead of shifting the wrong direction
- **Arrangement-aware** — tuning now follows the active arrangement path (Lead, Rhythm, Bass) and updates automatically when you switch
- **Drop/Standard badge** — the player button now shows "Drop -7" or "Standard -2" so you know at a glance whether to be in Drop D or E Standard
- **Parallel fetch** — tuning is fetched alongside song loading instead of after, so the MIDI CC is sent faster
- **LRU cache** — parsed PSARC tunings are cached in memory so arrangement switches and replays are instant

## Compatible Devices

Any modeler or effects unit that accepts MIDI CC to control pitch shifting:

- **Standard** — Fractal (Axe-FX III, FM9, FM3), Line 6 (Helix, HX Stomp), Boss (GT-1000, GX-100), Neural DSP (Quad Cortex), Headrush (Prime, Pedalboard)
- **Kemper** — Profiler, Player, Stage
- **Any other device** — use the Custom profile to define your own shift range and CC mapping

> **Note:** Only **Fractal Audio** devices have been personally tested and validated with this plugin. Other devices use standard MIDI CC mapping but may require manual configuration.

## Requirements

- **Chrome or Edge browser** (Firefox does not support Web MIDI)
- A USB MIDI device visible to the browser — either the modeler directly via USB, or a USB MIDI interface (e.g. MIDI Sport, Zoom U-44) connected to the device's 5-pin MIDI IN

## Installation

```bash
cd /path/to/slopsmith/plugins
git clone https://github.com/masc0t/slopsmith-plugin-midi-capo.git midi_capo
docker compose restart
```

## How It Works

1. Connect your modeler via USB MIDI
2. Go to **Settings** and select your device from the **Device** dropdown under Virtual Capo — this populates the CC#, shift range, and CC range as defaults, but all fields remain editable
3. Go to **Capo** in the navigation — the plugin detects your MIDI device and sends a center value (0 shift)
4. When a song loads, the plugin extracts tuning offsets from the PSARC (with CentOffset correction) for the active arrangement and calculates the semitone shift
5. The corresponding CC value is sent automatically to your MIDI device — tuning is fetched in parallel with song loading for minimal delay
6. Use the **Test** button to manually send a shift and verify the correct pitch change on your device

> **Note:** The plugin includes a server-side route (`routes.py`) that reads tuning data directly from PSARC files, so it works without any modifications to the Slopsmith core.

## Device Setup

> **Note:** Selecting a device preset populates all fields (CC#, shift range, CC value range) with sensible defaults for that device. All fields remain editable — adjust anything to match your specific setup.

### Standard Modelers (Fractal / Helix / Boss / Neural DSP / Headrush)

Most modern modelers use a 0–127 CC range where the center (64) is 0 shift.

1. **Plugin** — Select the **Standard** preset.
2. **CC#** — Set this to match your device (e.g. 18 for Fractal, 1 for some Helix blocks).
3. **Shift Range** — Usually ±24 semitones.

#### Quick Setup Guides:
- **Fractal**: Set External Control 1 to CC #18. Assign Pitch block (Virtual Capo type) Shift to External 1.
- **Helix**: Assign the **Interval** parameter (in a Poly Capo or Simple Pitch block) to MIDI CC #18.
- **Boss GT-1000**: Create assignment: Target=Pitch Shifter Shift, Source=CC #18, Range=-24 to +24.
- **Neural DSP QC**: Use MIDI Learn on the Shift parameter and send CC #18 from the plugin Test button.
- **Headrush**: Assign pitch parameter to MIDI CC #18.

### Kemper (Profiler / Player / Stage)

1. The Kemper uses **CC #38** for Rig Transpose — no configuration needed on the Kemper side.
2. **Plugin** — Select the **Kemper** preset. Defaults: CC 38, shift ±36, CC range 28–100.

### Custom

For any device not listed above. Select **Custom** and configure all fields manually:

- **CC#** — whichever CC number you've assigned on your device
- **Min/Max Shift** — your device's pitch range in semitones (e.g. -24 to +24)
- **CC Min/Max** — the CC value range your device expects (usually 0–127, but some devices use a subset like Kemper's 28–100)

The plugin maps semitones to CC values linearly across these ranges.

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
