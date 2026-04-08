# Slopsmith Plugin: Virtual Capo

A plugin for [Slopsmith](https://github.com/byrongamatos/slopsmith) that sends MIDI CC messages to your Fractal Audio modeler, automatically setting the Virtual Capo pitch shift to match each song's tuning during playback.

## Features

- **Auto-detect MIDI devices** — uses the Web MIDI API to find connected USB MIDI devices
- **Automatic tuning detection** — reads the song's tuning and calculates the correct semitone shift
- **Standard & Drop tuning support** — handles E Standard, D Standard, Drop D, Drop C, 7-string, and more
- **Configurable CC & channel** — route to any MIDI channel and CC number to match your Fractal setup
- **Test button** — send a pitch shift manually to verify your connection
- **Center on startup** — sends CC 64 (0 shift) on initialization so the Virtual Capo starts neutral
- **Auto-save** — settings persist in localStorage, saved automatically on change

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
4. When a song loads, the plugin reads its tuning, calculates the semitone shift, and sends the corresponding CC value
5. Use the "Test" button to manually send a shift and verify the correct pitch change on your device

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

## License

MIT
