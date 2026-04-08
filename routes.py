"""Virtual Capo plugin — extract raw tuning offsets from PSARC."""

import json


def setup(app, context):

    @app.get("/api/plugins/midi_capo/tuning/{filename:path}")
    def get_tuning(filename: str):
        from psarc import read_psarc_entries
        dlc = context["get_dlc_dir"]()
        if not dlc:
            return {"error": "DLC folder not configured"}

        psarc_path = dlc / filename
        if not psarc_path.exists():
            return {"error": "File not found"}

        files = read_psarc_entries(str(psarc_path), ["*.json"])

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
                    return {"tuning": offsets}

        return {"tuning": [0, 0, 0, 0, 0, 0]}
