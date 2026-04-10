"""Virtual Capo plugin — extract tuning offsets from PSARC."""

import json
from functools import lru_cache


def _apply_cent_offset(offsets, cent_offset, arr_name):
    """Adjust tuning offsets by CentOffset (virtual capo correction)."""
    if not cent_offset:
        return offsets
    shift = round(cent_offset / 100)
    n_strings = 4 if arr_name == "Bass" else 6
    return [o + shift if i < n_strings else o
            for i, o in enumerate(offsets)]


@lru_cache(maxsize=256)
def _parse_tunings(psarc_path: str) -> dict[str, tuple[int, ...]]:
    """Parse and cache all arrangement tunings from a PSARC."""
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
                offsets = _apply_cent_offset(offsets, cent_offset, arr_name)
                arr_tunings[arr_name] = tuple(offsets)

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
            return {"tuning": [0, 0, 0, 0, 0, 0]}

        if arrangement and arrangement in arr_tunings:
            return {"tuning": list(arr_tunings[arrangement])}
        for name in ("Lead", "Rhythm", "Combo"):
            if name in arr_tunings:
                return {"tuning": list(arr_tunings[name])}
        return {"tuning": list(next(iter(arr_tunings.values())))}
