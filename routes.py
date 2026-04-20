"""MIDI Capo plugin — extract tuning offsets from PSARC."""

import json
from functools import lru_cache


def _split_cent_offset(cent_offset):
    """Split CentOffset into (whole_semitone_shift, residual_cents).
    23 -> (0, 23). -120 -> (-1, -20). 0 -> (0, 0)."""
    if not cent_offset:
        return 0, 0
    shift = round(cent_offset / 100)
    return shift, int(round(cent_offset - shift * 100))


def _apply_semitone_shift(offsets, shift, arr_name):
    """Add a whole-semitone shift to the played strings (4 for Bass, else 6)."""
    if not shift:
        return offsets
    n_strings = 4 if arr_name == "Bass" else 6
    return [o + shift if i < n_strings else o
            for i, o in enumerate(offsets)]


@lru_cache(maxsize=256)
def _parse_tunings(psarc_path: str) -> dict[str, tuple]:
    """Parse and cache all arrangement tunings from a PSARC.
    Returns {arr_name: (offsets_tuple, residual_cents)}."""
    from psarc import read_psarc_entries
    files = read_psarc_entries(psarc_path, ["*.json"])

    arr_tunings = {}
    for path, data in sorted(files.items()):
        if not path.endswith(".json"):
            continue
        try:
            j = json.loads(data)
        except json.JSONDecodeError:
            import re
            text = data.decode("utf-8", errors="ignore")
            text = re.sub(r",\s*([}\]])", r"\1", text)
            try:
                j = json.loads(text)
            except Exception:
                continue

        for k, v in j.get("Entries", {}).items():
            attrs = v.get("Attributes", {})
            arr_name = attrs.get("ArrangementName", "")
            if arr_name in ("Vocals", "ShowLights", "JVocals"):
                continue
            tun = attrs.get("Tuning")
            if tun and isinstance(tun, dict):
                offsets = [tun.get(f"string{i}", 0) for i in range(6)]
                cent_offset = attrs.get("CentOffset", 0.0) or 0.0
                shift, residual = _split_cent_offset(cent_offset)
                offsets = _apply_semitone_shift(offsets, shift, arr_name)
                arr_tunings[arr_name] = (tuple(offsets), residual)

    return arr_tunings


def setup(app, context):

    @app.get("/api/plugins/midi_capo/tuning/{filename:path}")
    def get_tuning(filename: str, arrangement: str = ""):
        dlc = context["get_dlc_dir"]()
        if not dlc:
            return {"error": "DLC folder not configured"}

        psarc_path = dlc / filename
        if not psarc_path.exists():
            return {"error": "File not found"}

        arr_tunings = _parse_tunings(str(psarc_path))

        if not arr_tunings:
            return {"tuning": [0, 0, 0, 0, 0, 0], "centOffsetResidual": 0}

        def _resp(entry):
            offsets, residual = entry
            return {"tuning": list(offsets), "centOffsetResidual": residual}

        if arrangement and arrangement in arr_tunings:
            return _resp(arr_tunings[arrangement])
        for name in ("Lead", "Rhythm", "Combo"):
            if name in arr_tunings:
                return _resp(arr_tunings[name])
        return _resp(next(iter(arr_tunings.values())))
