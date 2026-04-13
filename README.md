# Slopsmith Plugin: Virtual Capo

A plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that sends MIDI CC messages to your amp/modeler, automatically setting the pitch shift to match each song's tuning during playback. Supports Fractal Audio, Kemper, Line 6 Helix, Boss GT-1000, Neural DSP Quad Cortex, Headrush, and any device via Custom mode.

## Features

- **Auto-detect MIDI devices** — uses the Web MIDI API to find connected USB MIDI devices
- **Automatic tuning detection** — reads the song's tuning and calculates the correct semitone shift, with CentOffset (virtual capo) correction for CDLCs that use it
- **Arrangement-aware** — responds to the currently selected path (Lead, Rhythm, Bass) and re-fetches tuning on arrangement change
- **Standard & Drop tuning support** — handles E Standard, D Standard, Drop D, Drop C, 7-string, and more
- **Device profiles** — built-in profiles for Fractal Audio, Kemper, Line 6 Helix, Boss GT-1000, Neural DSP QC, and Headrush, plus a fully configurable Custom mode
- **Configurable CC & channel** — route to any MIDI channel and CC number to match your setup
- **Player bar badge** — shows the current shift with tuning type indicator (e.g. "Drop -7" or "Standard -2"); click to disengage/re-engage the capo on the fly
- **Device reconnect** — automatically re-sends the last shift if your USB MIDI device disconnects and reconnects mid-song
- **Test button** — send a pitch shift manually to verify your connection
- **Center on startup** — sends the center CC value (0 shift) on initialization so the pitch starts neutral
- **Auto-save** — settings persist in localStorage, saved automatically on change

## What's New

### v1.2
- **Multi-device presets** — built-in presets for Fractal Audio, Kemper, Line 6 Helix, Boss GT-1000, Neural DSP QC, and Headrush — selecting a device populates defaults that you can still customize
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

- **Fractal Audio** — Axe-FX III, FM9 (USB MIDI), FM3 (5-pin MIDI only — use a USB MIDI interface)
- **Kemper** — Profiler, Player, Stage
- **Line 6** — Helix, Helix LT, HX Stomp, HX Stomp XL, POD Go
- **Boss/Roland** — GT-1000, GT-1000CORE, GX-100
- **Neural DSP** — Quad Cortex
- **Headrush** — Pedalboard, MX5, Prime, Gigboard
- **Any other device** — use the Custom profile to define your own shift range and CC mapping

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
2. Go to **Settings** and select your device from the **Device** dropdown under Virtual Capo
3. Go to **Capo** in the navigation — the plugin detects your MIDI device and sends a center value (0 shift)
4. When a song loads, the plugin extracts tuning offsets from the PSARC (with CentOffset correction) for the active arrangement and calculates the semitone shift
5. The corresponding CC value is sent automatically to your MIDI device — tuning is fetched in parallel with song loading for minimal delay
6. Use the **Test** button to manually send a shift and verify the correct pitch change on your device

> **Note:** The plugin includes a server-side route (`routes.py`) that reads tuning data directly from PSARC files, so it works without any modifications to the Slopsmith core.

## Device Setup

### Fractal Audio (Axe-FX III / FM9 / FM3)

1. **MIDI/Remote** — Go to Setup > MIDI/Remote > External. Set **External Control 1** to CC #18.
2. **Pitch Block** — Place a Pitch block in your preset. Change **Type** to **Virtual Capo**.
3. **Modifier** — Edit the Modifier for **Shift**. Set **Source 1** to **External 1**.
4. **Plugin** — Select the **Fractal Audio** profile. Default CC is 18.

### Kemper (Profiler / Player / Stage)

1. The Kemper uses **CC #38** for Rig Transpose — no configuration needed on the Kemper side.
2. **Plugin** — Select the **Kemper** profile. CC is automatically set to 38.
3. The Kemper supports a wider ±36 semitone range and uses CC values 28–100 (not the full 0–127).

### Line 6 (Helix / HX Stomp / POD Go)

1. **Pitch Block** — Add a Pitch Whammy or Simple Pitch block to your preset.
2. **Controller Assign** — Assign the pitch parameter to a MIDI CC. Press the knob, select **MIDI CC**, and choose CC #18 (or any unused CC).
3. **MIDI Settings** — Go to Global Settings > MIDI/Tempo. Ensure MIDI input is enabled on the correct port.
4. **Plugin** — Select the **Line 6 Helix** profile. Set CC# to match what you assigned on the Helix.

### Boss GT-1000 / GX-100

1. **Pitch Block** — Add a Pitch Shifter effect to your patch.
2. **MIDI Assign** — In the Assign section, create an assignment: Target = Pitch Shifter Shift, Source = CC #18, Range = -24 to +24.
3. **MIDI Settings** — Ensure MIDI is enabled on the USB port under System > MIDI.
4. **Plugin** — Select the **Boss GT-1000** profile. Set CC# to match your assignment.

### Neural DSP Quad Cortex

1. **Pitch Block** — Add a Pitch Shifter block to your preset.
2. **MIDI Learn** — Long-press the Shift parameter, tap **MIDI Learn**, and send CC #18 from the plugin's Test button.
3. **MIDI Settings** — Go to Settings > MIDI. Ensure MIDI over USB is enabled.
4. **Plugin** — Select the **Neural DSP QC** profile. Set CC# to match what you assigned.

### Headrush (Pedalboard / MX5 / Prime)

1. **Pitch Block** — Add a Wham or pitch effect to your rig.
2. **MIDI Assign** — In the MIDI settings for the block, assign the pitch parameter to CC #18.
3. **MIDI Settings** — Ensure MIDI input is enabled (USB or 1/8" TRS depending on model).
4. **Plugin** — Select the **Headrush** profile. Set CC# to match your assignment.

### Custom (Any Device)

Use this for any modeler not listed above, or for non-standard configurations.

1. Select **Custom** from the Device dropdown.
2. Set the **Min Shift** and **Max Shift** to match your device's pitch range in semitones (e.g. -24 to +24).
3. Set **CC Min** and **CC Max** to match the CC value range your device expects (usually 0–127, but some devices use a subset like 28–100).
4. Set the **CC#** to whichever CC number you've assigned on your device.
5. The plugin maps semitones to CC values linearly across these ranges.

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
