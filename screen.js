// Virtual Capo plugin
// Auto-sets Fractal Pitch block Shift via MIDI CC based on song tuning.

let _capoMidiAccess = null;
let _capoMidiOutput = null;
let _capoLastTitle = null;
let _capoLastShift = null;

// ── Web MIDI API ────────────────────────────────────────────────────────

async function capoMidiInit() {
    const status = document.getElementById('capo-midi-status');
    if (!navigator.requestMIDIAccess) {
        status.innerHTML = `
            <div class="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-semibold">Web MIDI not supported</p>
                <p class="text-gray-400">Use Chrome or Edge. Firefox does not support Web MIDI.</p>
            </div>`;
        return;
    }

    try {
        _capoMidiAccess = await navigator.requestMIDIAccess({ sysex: false });
        _capoUpdateDevices();
        _capoMidiAccess.onstatechange = () => { _capoUpdateDevices(); _capoResend(); };
    } catch (e) {
        status.innerHTML = `
            <div class="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm">
                <p class="text-red-400 font-semibold">MIDI access denied</p>
                <p class="text-gray-400">${e.message}</p>
            </div>`;
    }
}

function _capoUpdateDevices() {
    const status = document.getElementById('capo-midi-status');
    if (!_capoMidiAccess) return;

    const outputs = [];
    _capoMidiAccess.outputs.forEach(o => outputs.push(o));

    if (outputs.length === 0) {
        status.innerHTML = `
            <div class="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-semibold">No MIDI output devices</p>
                <p class="text-gray-400">Connect your amp/modeler via USB MIDI.</p>
            </div>`;
        _capoMidiOutput = null;
        document.getElementById('capo-test').classList.add('hidden');
        return;
    }

    const savedId = localStorage.getItem('midi_output_id');
    _capoMidiOutput = outputs.find(o => o.id === savedId) || outputs[0];

    let html = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 flex items-center gap-3">
        <span class="text-green-400 text-xs">MIDI Ready</span>
        <select id="capo-device-select" onchange="capoSelectDevice(this.value)"
            class="bg-dark-600 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none">`;
    for (const o of outputs) {
        const selected = o.id === _capoMidiOutput.id ? 'selected' : '';
        html += `<option value="${o.id}" ${selected}>${esc(o.name)}</option>`;
    }
    html += `</select></div>`;
    status.innerHTML = html;
    document.getElementById('capo-test').classList.remove('hidden');

    _capoSendCenter();
}

function capoSelectDevice(id) {
    if (!_capoMidiAccess) return;
    _capoMidiAccess.outputs.forEach(o => {
        if (o.id === id) _capoMidiOutput = o;
    });
    localStorage.setItem('midi_output_id', id);
}

function _capoMidiSend(channel, cc, value) {
    if (!_capoMidiOutput) return;
    const ch = channel & 0x0F;
    _capoMidiOutput.send([0xB0 | ch, cc & 0x7F, value & 0x7F]);
    console.log(`[MIDI] Ch${ch} CC#${cc} = ${value}`);
}

function capoTestSend() {
    const settings = _capoGetSettings();
    const shift = parseInt(document.getElementById('capo-test-shift').value) || 0;
    const value = _capoShiftToCC(shift);
    _capoMidiSend(settings.channel, settings.cc, value);
    console.log(`[MIDI] Virtual Capo test: shift=${shift}, CC#${settings.cc}=${value}`);
}

// ── Virtual Capo Logic ──────────────────────────────────────────────────

function _capoGetSettings() {
    return {
        enabled: localStorage.getItem('midi_capo_enabled') === 'true',
        channel: parseInt(localStorage.getItem('midi_capo_channel') || '0'),
        cc: parseInt(localStorage.getItem('midi_capo_cc') || '18'),
    };
}

function _capoFetchTuning(filename, arrangement) {
    let url = `/api/plugins/midi_capo/tuning/${encodeURIComponent(decodeURIComponent(filename))}`;
    if (arrangement) url += `?arrangement=${encodeURIComponent(arrangement)}`;
    return fetch(url)
        .then(r => r.json())
        .then(data => data.tuning || null);
}

function _capoCalcShift(tuning) {
    // tuning = array of 6 ints, offsets from E Standard
    // Returns the semitone shift for the Fractal Virtual Capo
    if (!tuning || tuning.length < 6) return 0;

    const [s0, s1, s2, s3, s4, s5] = tuning;

    // Drop tuning: string0 is 2 semitones below string1
    // Covers standard drop (Drop D/C/B) and 7-string drop variants
    // where strings 4-5 may differ slightly from strings 1-3
    if (s0 === s1 - 2) {
        // Guitar is assumed to be in Drop D, shift = string1's offset
        return s1;
    }

    // Standard tuning: all strings same offset
    if (s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4 && s4 === s5) {
        // Guitar is assumed to be in E Standard, shift = the common offset
        return s0;
    }

    // 7-string standard: [X, X, X, X, X+1, X] pattern
    if (s0 === s1 && s1 === s2 && s2 === s3 && s4 === s1 + 1 && (s5 === s1 || s5 === s1 + 1)) {
        return s1;
    }

    // Unknown tuning shape — no shift
    return 0;
}

function _capoIsDrop(tuning) {
    if (!tuning || tuning.length < 6) return false;
    return tuning[0] === tuning[1] - 2;
}

function _capoShiftToCC(shift) {
    // Fractal Virtual Capo Shift: modifier maps CC 0-127 to parameter range
    // With range -24..+24: center (0 shift) = 64, each semitone = 127/48 ≈ 2.646
    return Math.max(0, Math.min(127, Math.round(64 + shift * (127 / 48))));
}

function _capoSendCenter() {
    const settings = _capoGetSettings();
    if (!settings.enabled || !_capoMidiOutput) return;
    _capoMidiSend(settings.channel, settings.cc, 64);
    console.log(`[MIDI] Virtual Capo: init center (0 shift), CC#${settings.cc}=64`);
}

function _capoSend(tuning) {
    const settings = _capoGetSettings();
    if (!settings.enabled || !_capoMidiOutput) return;

    const shift = _capoCalcShift(tuning);
    const drop = _capoIsDrop(tuning);
    _capoLastShift = shift;
    _capoUpdateBadge(shift, drop);
    if (_capoDisengaged) return;
    const value = _capoShiftToCC(shift);
    _capoMidiSend(settings.channel, settings.cc, value);
    console.log(`[MIDI] Virtual Capo: tuning=${JSON.stringify(tuning)}, shift=${shift}, CC#${settings.cc}=${value}`);
}

function _capoResend() {
    if (_capoLastShift === null) return;
    const settings = _capoGetSettings();
    if (!settings.enabled || !_capoMidiOutput) return;
    const value = _capoShiftToCC(_capoLastShift);
    _capoMidiSend(settings.channel, settings.cc, value);
    console.log(`[MIDI] Virtual Capo: resend shift=${_capoLastShift}, CC#${settings.cc}=${value}`);
}

let _capoLastTuningOffsets = null;
let _capoLastArrangement = null;
let _capoLastFilename = null;

function _capoCheck() {
    const info = highway.getSongInfo();
    if (!info || !info.title) return;

    const arrChanged = info.arrangement !== _capoLastArrangement;
    const songChanged = info.title !== _capoLastTitle;
    if (!songChanged && !arrChanged) return;

    // Only use websocket tuning if core provides it (skips API fetch path)
    if (info.tuning && Array.isArray(info.tuning)) {
        _capoLastTitle = info.title;
        _capoLastArrangement = info.arrangement;
        _capoLastTuningOffsets = info.tuning;
        _capoSend(info.tuning);
    } else if (arrChanged && _capoLastFilename) {
        // Arrangement changed — re-fetch tuning for new path
        _capoLastArrangement = info.arrangement;
        _capoFetchTuning(_capoLastFilename, info.arrangement).then(offsets => {
            if (offsets) {
                _capoLastTuningOffsets = offsets;
                _capoSend(offsets);
            }
        }).catch(() => {});
    }
    // Otherwise the playSong wrapper handles it via plugin route
}

// Poll for song tuning changes
setInterval(_capoCheck, 100);

// ── Player Integration ──────────────────────────────────────────────────

let _capoDisengaged = false;

function _capoInjectBadge() {
    const controls = document.getElementById('player-controls');
    if (!controls || document.getElementById('btn-capo')) return;
    const closeBtn = controls.querySelector('button:last-child');
    const btn = document.createElement('button');
    btn.id = 'btn-capo';
    btn.className = 'px-3 py-1.5 bg-amber-900/40 hover:bg-amber-900/60 rounded-lg text-xs text-amber-300 transition';
    btn.textContent = 'Capo 0';
    btn.title = 'Click to disengage Virtual Capo';
    btn.onclick = _capoToggleDisengage;
    controls.insertBefore(btn, closeBtn);
    _capoDisengaged = false;
}

function _capoToggleDisengage() {
    const settings = _capoGetSettings();
    if (_capoDisengaged) {
        _capoDisengaged = false;
        _capoResend();
    } else {
        _capoDisengaged = true;
        _capoMidiSend(settings.channel, settings.cc, 64);
    }
    _capoStyleBadge();
}

function _capoStyleBadge() {
    const btn = document.getElementById('btn-capo');
    if (!btn) return;
    if (_capoDisengaged) {
        btn.className = 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-500 transition line-through';
        btn.title = 'Click to re-engage Virtual Capo';
    } else {
        btn.className = 'px-3 py-1.5 bg-amber-900/40 hover:bg-amber-900/60 rounded-lg text-xs text-amber-300 transition';
        btn.title = 'Click to disengage Virtual Capo';
    }
}

function _capoUpdateBadge(shift, drop) {
    const btn = document.getElementById('btn-capo');
    if (!btn) return;
    const label = drop ? 'Drop' : 'Standard';
    btn.textContent = `${label} ${shift >= 0 ? '+' : ''}${shift}`;
    if (_capoDisengaged) {
        _capoDisengaged = false;
        _capoStyleBadge();
    }
}

(function() {
    const origPlaySong = window.playSong;
    window.playSong = async function(filename, arrangement) {
        _capoLastTitle = null;
        _capoLastArrangement = null;
        _capoLastTuningOffsets = null;
        _capoLastFilename = filename;
        // Start tuning fetch in parallel with song load
        const tuningPromise = _capoFetchTuning(filename, arrangement);
        await origPlaySong(filename, arrangement);
        _capoInjectBadge();
        // Use pre-fetched tuning (should already be resolved by now)
        tuningPromise.then(offsets => {
            if (offsets) {
                const info = highway.getSongInfo();
                _capoLastTuningOffsets = offsets;
                _capoLastTitle = info?.title || '';
                _capoLastArrangement = info?.arrangement || '';
                _capoSend(offsets);
            }
        }).catch(() => {});
    };
})();

// ── Status Display ──────────────────────────────────────────────────────

function _capoUpdateStatus() {
    const el = document.getElementById('capo-status');
    if (!el) return;
    const settings = _capoGetSettings();
    if (!settings.enabled) {
        el.innerHTML = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 text-xs text-gray-500">
            Virtual Capo is disabled. Enable it in Settings.</div>`;
        return;
    }
    const tuning = _capoLastTuningOffsets;
    if (!tuning) {
        el.innerHTML = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 text-xs text-gray-500">
            Virtual Capo enabled (CC#${settings.cc}, Ch${settings.channel}) — no song loaded</div>`;
        return;
    }
    const shift = _capoCalcShift(tuning);
    const val = _capoShiftToCC(shift);
    el.innerHTML = `<div class="bg-dark-700/50 border border-amber-800/30 rounded-xl p-3 flex items-center gap-3 text-xs">
        <span class="text-amber-400 font-semibold">Virtual Capo</span>
        <span class="text-gray-400">Tuning: [${tuning.join(', ')}]</span>
        <span class="text-gray-400">Shift: ${shift >= 0 ? '+' : ''}${shift}</span>
        <span class="text-gray-500">CC#${settings.cc} Ch${settings.channel} → ${val}</span>
    </div>`;
}

function _capoLoadSettings() {
    const en = document.getElementById('midi-capo-enabled');
    const ch = document.getElementById('midi-capo-channel');
    const cc = document.getElementById('midi-capo-cc');
    if (en) en.checked = localStorage.getItem('midi_capo_enabled') === 'true';
    if (ch) ch.value = localStorage.getItem('midi_capo_channel') || '0';
    if (cc) cc.value = localStorage.getItem('midi_capo_cc') || '18';
}

// Hydrate settings inputs once DOM is ready
setTimeout(_capoLoadSettings, 100);

// Init MIDI on page load so Virtual Capo center is sent early
if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess({ sysex: false }).then(access => {
        _capoMidiAccess = access;
        const outputs = [];
        access.outputs.forEach(o => outputs.push(o));
        const savedId = localStorage.getItem('midi_output_id');
        _capoMidiOutput = outputs.find(o => o.id === savedId) || outputs[0] || null;
        if (_capoMidiOutput) _capoSendCenter();
        access.onstatechange = () => {
            const outs = [];
            _capoMidiAccess.outputs.forEach(o => outs.push(o));
            const saved = localStorage.getItem('midi_output_id');
            _capoMidiOutput = outs.find(o => o.id === saved) || outs[0] || null;
            _capoResend();
        };
    }).catch(() => {});
}

// Init on screen show
(function() {
    const origShowScreen = window.showScreen;
    window.showScreen = function(id) {
        origShowScreen(id);
        if (id === 'plugin-midi_capo') {
            capoMidiInit();
            _capoUpdateStatus();
        }
        if (id === 'settings') {
            _capoLoadSettings();
        }
    };
})();
