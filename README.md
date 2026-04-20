# Slopsmith Plugin: MIDI Capo

A plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that sends MIDI CC messages to your amp/modeler — or directly to a VST loaded in the Slopsmith desktop chain — automatically setting the pitch shift to match each song's tuning during playback. Supports Fractal Audio, Kemper, Line 6 Helix, Boss GT-1000, Neural DSP Quad Cortex, Headrush, VST plugins in desktop mode, and any device via Custom mode.

## Features

- **Internal VST routing** — in Slopsmith desktop mode, route MIDI CC/PC directly to VSTs in your chain (e.g. Polychrome DSP HyperTune) with no external hardware required
- **Auto-detect MIDI devices** — uses the Web MIDI API to find connected USB MIDI devices
- **Automatic tuning detection** — reads the song's tuning and calculates the correct semitone shift, with CentOffset (MIDI capo) correction for CDLCs that use it
- **Arrangement-aware** — responds to the currently selected path (Lead, Rhythm, Bass) and re-fetches tuning on arrangement change
- **Standard & Drop tuning support** — handles E Standard, D Standard, Drop D, Drop C, 7-string, and more
- **Device presets** — built-in presets for Standard modelers (Fractal, Helix, Boss, etc.), Kemper, DigiTech Whammy DT, and Custom — each populates sensible defaults that you can still customize
- **Program Change (PC) mode** — for pedals that switch presets via PC instead of CC sweeps (e.g. DigiTech Whammy DT)
- **Cent-accurate true tuning** — for non-A440 references the Whammy DT profile sends a combined PC + CC#11 depth message so the pedal lands on the exact target Hertz
- **Configurable CC/PC & channel** — route to any MIDI channel and CC/PC number to match your setup
- **Player bar badge** — shows the current shift with tuning type indicator (e.g. "Drop -7" or "Standard -2"); click to disengage/re-engage the capo on the fly
- **Device reconnect** — automatically re-sends the last shift if your USB MIDI device disconnects and reconnects mid-song
- **Test button** — send a pitch shift manually to verify your connection
- **Center on startup** — sends the center CC value (0 shift) on initialization so the pitch starts neutral
- **Auto-save** — settings persist in localStorage, saved automatically on change

## What's New

### v1.5
- **DigiTech Whammy DT (full RSMods parity)** — drop-side PC mapping rewritten to match the proven [RSMods](https://github.com/Lovrom8/RSMods) values across the pedal's full ±12 semitone range (PC 42–49 for +1..+12, PC 52–59 for -1..-12, PC 78 for E Standard / NULL). Previous mapping was off-by-one and only covered the down side.
- **Non-A440 cent correction** — for songs with a fractional `CentOffset` (e.g. Hendrix A446), the plugin now sends a Whammy-side PC + CC#11 depth message that lands the pedal at the exact target Hertz. Mirrors RSMods `AutoTrueTuningPastLimits`. The server route additionally returns `centOffsetResidual` (raw cents leftover after whole-semitone rounding); older clients ignoring it are unaffected.
- **Status & badge** — player-bar capo badge and Capo screen status now show the residual cents (e.g. `Drop -1 +23¢`) when the cent-depth path is active.
- Dropdown label simplified: "DigiTech Whammy DT (Drop Side)" → "DigiTech Whammy DT" (the profile drives both sides now).

> **Status:** Whammy DT support is ported from [RSMods](https://github.com/Lovrom8/RSMods) (which is community-validated on real hardware) but has **not** been tested on a physical pedal in this repo. PC numbers, CC#11 depth formula, and bypass slot all match the RSMods reference values 1:1. If you own a Whammy DT, please report any discrepancies via GitHub issue.

> **Note:** The Whammy DT's foot plate instantly overrides any depth value sent over MIDI. Leave the toe alone while a song is loaded for the cent correction to take effect.

### v1.4
- **Internal VST output** — when running inside Slopsmith desktop, the device dropdown now includes an **Internal VST (Slopsmith)** option that routes CC messages directly to every VST slot in your audio chain. No USB MIDI hardware or Web MIDI access required.
- **Auto-select** — if no external device has been saved, the internal output is selected by default in desktop mode.

### v1.3
- **Consolidated Profiles** — Fractal, Helix, Boss, Neural DSP, and Headrush are now grouped into a single **Standard** profile to simplify setup, as they share the same parameters.

### v1.2
- **Multi-device presets** — built-in presets for Standard modelers, Kemper, and Custom — selecting a device populates defaults that you can still customize
- **Custom mode** — fully configurable shift range and CC range for any device not listed
- **Universal CC formula** — linear interpolation across each profile's CC range, replacing the Fractal-specific hardcoded formula
- **Profile-aware center** — center/zero CC value computed from profile params instead of hardcoded 64

### v1.1
- **CentOffset fix** — CDLCs that use MIDI capo encoding (positive tuning offsets with a negative CentOffset) now resolve to the correct pitch shift instead of shifting the wrong direction
- **Arrangement-aware** — tuning now follows the active arrangement path (Lead, Rhythm, Bass) and updates automatically when you switch
- **Drop/Standard badge** — the player button now shows "Drop -7" or "Standard -2" so you know at a glance whether to be in Drop D or E Standard
- **Parallel fetch** — tuning is fetched alongside song loading instead of after, so the MIDI CC is sent faster
- **LRU cache** — parsed PSARC tunings are cached in memory so arrangement switches and replays are instant

## Compatible Devices

Any modeler, effects unit, or VST that accepts MIDI CC to control pitch shifting:

- **Internal VST (Slopsmith desktop)** — any VST loaded in the Slopsmith audio chain that exposes MIDI CC to a transpose/pitch parameter (e.g. Polychrome DSP HyperTune)
- **Standard** — Fractal (Axe-FX III, FM9, FM3), Line 6 (Helix, HX Stomp), Boss (GT-1000, GX-100), Neural DSP (Quad Cortex), Headrush (Prime, Pedalboard)
- **Kemper** — Profiler, Player, Stage
- **DigiTech Whammy DT** — full ±12 semitone Drop-Tune-side mapping plus CC#11 depth fine-tuning for non-A440 songs, lifted from [RSMods](https://github.com/Lovrom8/RSMods)
- **Any other device** — use the Custom profile to define your own shift range and CC mapping

> **Note:** Only **Fractal Audio** devices and the **Internal VST** path (with Polychrome DSP HyperTune) have been personally tested and validated with this plugin. Other devices use standard MIDI CC mapping but may require manual configuration.

## Requirements

One of:

- **Slopsmith desktop** with a MIDI-controllable VST loaded in the audio chain (no browser MIDI access needed), **or**
- **Chrome or Edge browser** (Firefox does not support Web MIDI) **plus** a USB MIDI device visible to the browser — either the modeler directly via USB, or a USB MIDI interface (e.g. MIDI Sport, Zoom U-44) connected to the device's 5-pin MIDI IN

## Installation

```bash
cd /path/to/slopsmith/plugins
git clone https://github.com/masc0t/slopsmith-plugin-midi-capo.git midi_capo
docker compose restart
```

## How It Works

1. Connect your modeler via USB MIDI — **or**, in Slopsmith desktop, load a MIDI-capable VST into your audio chain
2. Go to **Settings** and select your device from the **Device** dropdown under MIDI Capo — this populates the CC#, shift range, and CC range as defaults, but all fields remain editable
3. Go to **Capo** in the navigation — pick your output from the device selector (external MIDI device or **Internal VST (Slopsmith)**) and the plugin sends a center value (0 shift)
4. When a song loads, the plugin extracts tuning offsets from the PSARC (with CentOffset correction) for the active arrangement and calculates the semitone shift
5. The corresponding CC value is sent automatically to your MIDI device — tuning is fetched in parallel with song loading for minimal delay
6. Use the **Test** button to manually send a shift and verify the correct pitch change on your device

> **Note:** The plugin includes a server-side route (`routes.py`) that reads tuning data directly from PSARC files, so it works without any modifications to the Slopsmith core.

## Device Setup

> **Note:** Selecting a device preset populates all fields (CC#, shift range, CC value range) with sensible defaults for that device. All fields remain editable — adjust anything to match your specific setup.

### Internal VST (Slopsmith desktop)

When running inside the Slopsmith desktop app, the device selector exposes **Internal VST (Slopsmith)**. Selecting it routes CC messages directly to every VST slot in your chain — no external hardware or Web MIDI access required.

1. **Load a MIDI-capable pitch/transpose VST** into your Slopsmith audio chain. [**Polychrome DSP HyperTune**](https://polychromedsp.com/) is the reference plugin for this feature.
2. **Configure the VST's MIDI mapping.** In HyperTune, open **MIDI Mapping** and add a mapping:
   - **Type:** CC Value
   - **Destination:** Transpose
   - **CC/PC/Note:** CC #18
   - **Chan:** 1
3. **In MIDI Capo Settings**, select the **Standard** preset (CC #18, ±24 semitones, 0–127). These defaults align with the HyperTune mapping above.
4. **On the Capo screen**, pick **Internal VST (Slopsmith)** from the device dropdown (it is auto-selected if no external device has been saved).
5. Press **Test** — HyperTune's Transpose should move, confirming the chain is receiving CC #18 on channel 1.

Any VST that accepts MIDI CC on a transpose/pitch parameter will work the same way — just match the CC# and channel between the VST and the plugin settings.

### Standard Modelers (Fractal / Helix / Boss / Neural DSP / Headrush)

Most modern modelers use a 0–127 CC range where the center (64) is 0 shift.

1. **Plugin** — Select the **Standard** preset.
2. **CC#** — Set this to match your device (e.g. 18 for Fractal, 1 for some Helix blocks).
3. **Shift Range** — Usually ±24 semitones.

#### Quick Setup Guides:
- **Fractal**: Set External Control 1 to CC #18. Assign Pitch block (MIDI Capo type) Shift to External 1.
- **Helix**: Assign the **Interval** parameter (in a Poly Capo or Simple Pitch block) to MIDI CC #18.
- **Boss GT-1000**: Create assignment: Target=Pitch Shifter Shift, Source=CC #18, Range=-24 to +24.
- **Neural DSP QC**: Use MIDI Learn on the Shift parameter and send CC #18 from the plugin Test button.
- **Headrush**: Assign pitch parameter to MIDI CC #18.

### DigiTech Whammy DT

The Whammy DT profile uses Program Change to drive the **Drop Tune side** of the pedal across the full ±12 semitone range. For songs whose reference pitch isn't A440 (e.g. Hendrix tracks at A446), the plugin additionally sends a CC#11 depth message to the Whammy side to fine-tune the cents.

1. Connect the pedal's **MIDI IN** to your USB MIDI interface (or the Slopsmith desktop chain if running internally).
2. Set the pedal to listen on MIDI channel 1.
3. **Plugin** — Select the **DigiTech Whammy DT** preset. Defaults: PC mode, ±12 shift, PC bypass 78, CC#11 for depth.
4. Load any tuned song. The pedal will switch presets automatically — Drop side LED for whole-semitone tunings, Whammy side LED for non-A440 corrections.

> **Note:** The Whammy DT's foot plate instantly overrides any depth value sent over MIDI. If you touch the toe while a non-A440 song is loaded, the cent correction is lost until the next song change. Leave the toe alone for cent-accurate playback.

PC value table (for reference):

| Tuning | PC | Tuning | PC |
|--------|---:|--------|---:|
| E +OCT | 49 | E Standard | 78 |
| B Std (above) | 48 | Eb Standard | 59 |
| Bb Std (above) | 47 | D Standard | 58 |
| A Std (above) | 46 | C# Standard | 57 |
| Ab Std (above) | 45 | C Standard | 56 |
| G Std (above) | 44 | B Standard | 55 |
| F# Std (above) | 43 | Bb Standard | 54 |
| F Std (above) | 42 | A Standard | 53 |
|  |  | E -OCT | 52 |

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
