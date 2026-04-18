// Virtual Capo plugin
// Auto-sets pitch shift via MIDI CC based on song tuning.

const _capoProfiles = {
    standard:  { name: 'Standard (Fractal, Helix, etc.)', minShift: -24, maxShift: 24, ccMin: 0,  ccMax: 127, defaultCC: 18 },
    kemper:    { name: 'Kemper',                        minShift: -36, maxShift: 36, ccMin: 28, ccMax: 100, defaultCC: 38 },
    custom:    { name: 'Custom',                        minShift: -24, maxShift: 24, ccMin: 0,  ccMax: 127, defaultCC: 18 },
};

let _capoMidiAccess = null;
let _capoMidiOutput = null;
let _capoLastTitle = null;
let _capoLastShift = null;
let _capoLastTuningOffsets = null;
let _capoLastArrangement = null;
let _capoLastFilename = null;
let _capoDisengaged = false;
let _capoSettings = null;

// ── Settings (cached) ──────────────────────────────────────────────────

function _capoGetSettings() {
    if (!_capoSettings) {
        const profileKey = localStorage.getItem('midi_capo_profile') || 'standard';
        const profile = _capoProfiles[profileKey] || _capoProfiles.standard;
        _capoSettings = {
            enabled: localStorage.getItem('midi_capo_enabled') === 'true',
            profile: profileKey,
            channel: parseInt(localStorage.getItem('midi_capo_channel') || '0'),
            cc: parseInt(localStorage.getItem('midi_capo_cc') || String(profile.defaultCC || 0)),
            resetOnStop: localStorage.getItem('midi_capo_reset_on_stop') === 'true',
            minShift: parseInt(localStorage.getItem('midi_capo_min_shift') || String(profile.minShift)),
            maxShift: parseInt(localStorage.getItem('midi_capo_max_shift') || String(profile.maxShift)),
            ccMin: parseInt(localStorage.getItem('midi_capo_cc_min') || String(profile.ccMin)),
            ccMax: parseInt(localStorage.getItem('midi_capo_cc_max') || String(profile.ccMax)),
        };
    }
    return _capoSettings;
}

function _capoSaveSetting(key, value) {
    localStorage.setItem(key, value);
    _capoSettings = null; // invalidate cache
}

// ── Web MIDI API ────────────────────────────────────────────────────────

function _capoInitMidi(updateUI) {
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    const handleFailure = (msg, err) => {
        if (updateUI) {
            if (hasInternal) {
                _capoRenderDevices();
            } else {
                document.getElementById('capo-midi-status').innerHTML = `
                    <div class="bg-red-900/20 border border-red-800/30 rounded-xl p-4 text-sm">
                        <p class="text-red-400 font-semibold">${msg}</p>
                        <p class="text-gray-400">${err}</p>
                    </div>`;
            }
        }
    };

    if (!navigator.requestMIDIAccess) {
        handleFailure('Web MIDI not supported', 'Use Chrome or Edge. Firefox does not support Web MIDI.');
        return Promise.resolve();
    }

    return navigator.requestMIDIAccess({ sysex: false }).then(access => {
        _capoMidiAccess = access;
        _capoPickOutput();
        if (updateUI) _capoRenderDevices();
        _capoSendCenter();
        access.onstatechange = () => {
            _capoPickOutput();
            if (updateUI) _capoRenderDevices();
            _capoResend();
        };
    }).catch(e => {
        handleFailure('MIDI access denied', e.message);
    });
}

function _capoPickOutput() {
    let savedId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    
    // Auto-select internal if available and nothing else is set
    if (hasInternal && (!savedId || savedId === 'null' || savedId === 'undefined')) {
        savedId = 'internal';
        localStorage.setItem('midi_output_id', 'internal');
    }

    if (savedId === 'internal') {
        _capoMidiOutput = null;
        return;
    }
    if (!_capoMidiAccess) return;
    const outputs = [];
    _capoMidiAccess.outputs.forEach(o => outputs.push(o));
    _capoMidiOutput = outputs.find(o => o.id === savedId) || outputs[0] || null;
}

function _capoRenderDevices() {
    const status = document.getElementById('capo-midi-status');
    if (!status) return;

    const outputs = [];
    if (_capoMidiAccess) {
        _capoMidiAccess.outputs.forEach(o => outputs.push(o));
    }

    const hasInternal = !!(window.slopsmithDesktop?.audio);
    const savedId = localStorage.getItem('midi_output_id');

    if (outputs.length === 0 && !hasInternal) {
        status.innerHTML = `
            <div class="bg-yellow-900/20 border border-yellow-800/30 rounded-xl p-4 text-sm">
                <p class="text-yellow-400 font-semibold">No MIDI output devices</p>
                <p class="text-gray-400">Connect your amp/modeler via USB MIDI.</p>
            </div>`;
        document.getElementById('capo-test').classList.add('hidden');
        return;
    }

    let html = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 flex items-center gap-3">
        <span class="text-green-400 text-xs">MIDI Ready</span>
        <select id="capo-device-select" onchange="capoSelectDevice(this.value)"
            class="bg-dark-600 border border-gray-700 rounded-lg px-2 py-1 text-xs text-gray-300 outline-none">`;
    
    if (hasInternal) {
        const selected = (savedId === 'internal' || !savedId) ? 'selected' : '';
        html += `<option value="internal" ${selected}>Internal VST (Slopsmith)</option>`;
    }

    for (const o of outputs) {
        const selected = savedId === o.id ? 'selected' : '';
        html += `<option value="${o.id}" ${selected}>${esc(o.name)}</option>`;
    }
    html += `</select></div>`;
    status.innerHTML = html;
    document.getElementById('capo-test').classList.remove('hidden');
}

function capoSelectDevice(id) {
    localStorage.setItem('midi_output_id', id);
    _capoPickOutput();
}

async function _capoSendToInternal(channel, cc, value) {
    const api = window.slopsmithDesktop?.audio;
    if (!api || !api.sendMidiToSlot) return;
    
    try {
        const chain = await api.getChainState();
        const slots = chain.filter(s => s.type === 0); // 0 = VST
        if (slots.length === 0) return;

        const ch = parseInt(channel); 
        for (const slot of slots) {
            // Internal CC format: (slotId, type=1, channel[1-16], cc#, value)
            api.sendMidiToSlot(slot.id, 1, ch + 1, cc & 0x7F, value & 0x7F);
        }
    } catch (err) {
        console.error('[MIDI] Internal send failed:', err);
    }
}

function _capoMidiSend(channel, cc, value) {
    const savedId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    
    if (savedId === 'internal' || (hasInternal && !savedId)) {
        _capoSendToInternal(channel, cc, value);
        return;
    }
    
    if (!_capoMidiOutput) return;
    const ch = channel & 0x0F;
    _capoMidiOutput.send([0xB0 | ch, cc & 0x7F, value & 0x7F]);
}

function capoTestSend() {
    const settings = _capoGetSettings();
    const shift = parseInt(document.getElementById('capo-test-shift').value) || 0;
    const value = _capoShiftToCC(shift, settings);
    console.log(`[MIDI] Virtual Capo test: shift=${shift}, CC#${settings.cc}=${value}`);
    _capoMidiSend(settings.channel, settings.cc, value);
}

// ── Virtual Capo Logic ──────────────────────────────────────────────────

function _capoFetchTuning(filename, arrangement) {
    let url = `/api/plugins/midi_capo/tuning/${encodeURIComponent(decodeURIComponent(filename))}`;
    if (arrangement) url += `?arrangement=${encodeURIComponent(arrangement)}`;
    return fetch(url)
        .then(r => r.json())
        .then(data => data.tuning || null);
}

function _capoCalcShift(tuning) {
    // tuning = array of 6 ints, offsets from E Standard
    // Returns the semitone shift for the Virtual Capo
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

const _capoTuningNames = {
    '0,0,0,0,0,0': 'E Standard',
    '-1,-1,-1,-1,-1,-1': 'Eb Standard',
    '-2,-2,-2,-2,-2,-2': 'D Standard',
    '-3,-3,-3,-3,-3,-3': 'C# Standard',
    '-4,-4,-4,-4,-4,-4': 'C Standard',
    '-5,-5,-5,-5,-5,-5': 'B Standard',
    '-6,-6,-6,-6,-6,-6': 'Bb Standard',
    '-7,-7,-7,-7,-7,-7': 'A Standard',
    '-2,0,0,0,0,0': 'Drop D',
    '-3,-1,-1,-1,-1,-1': 'Drop C#',
    '-4,-2,-2,-2,-2,-2': 'Drop C',
    '-5,-3,-3,-3,-3,-3': 'Drop B',
    '-6,-4,-4,-4,-4,-4': 'Drop Bb',
    '-7,-5,-5,-5,-5,-5': 'Drop A',
    '-8,-6,-6,-6,-6,-6': 'Drop Ab',
    '-9,-7,-7,-7,-7,-7': 'Drop G',
};

function _capoTuningLabel(tuning) {
    if (!tuning) return '';
    const key = tuning.join(',');
    if (_capoTuningNames[key]) return _capoTuningNames[key];
    // Try matching just strings 0-3 for 4-string bass (last 2 are 0)
    if (tuning[4] === 0 && tuning[5] === 0) {
        for (const [k, name] of Object.entries(_capoTuningNames)) {
            const ref = k.split(',').map(Number);
            if (ref[0] === tuning[0] && ref[1] === tuning[1] && ref[2] === tuning[2] && ref[3] === tuning[3]) {
                return name + ' (Bass)';
            }
        }
    }
    return `[${tuning.join(', ')}]`;
}

function _capoShiftToCC(shift, s) {
    s = s || _capoGetSettings();
    const clamped = Math.max(s.minShift, Math.min(s.maxShift, shift));
    const range = s.maxShift - s.minShift;
    if (range === 0) return s.ccMin;
    const cc = s.ccMin + (clamped - s.minShift) / range * (s.ccMax - s.ccMin);
    return Math.max(s.ccMin, Math.min(s.ccMax, Math.round(cc)));
}

function _capoSendCenter() {
    const settings = _capoGetSettings();
    const outputId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    if (!settings.enabled || (!_capoMidiOutput && outputId !== 'internal' && !hasInternal)) return;
    const center = _capoShiftToCC(0, settings);
    _capoMidiSend(settings.channel, settings.cc, center);
    console.log(`[MIDI] Virtual Capo: init center (0 shift), CC#${settings.cc}=${center}`);
}

function _capoSend(tuning) {
    const settings = _capoGetSettings();
    const outputId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    if (!settings.enabled || (!_capoMidiOutput && outputId !== 'internal' && !hasInternal)) return;

    const shift = _capoCalcShift(tuning);
    const drop = _capoIsDrop(tuning);
    _capoLastShift = shift;
    _capoUpdateBadge(shift, drop);
    if (_capoDisengaged) return;
    const value = _capoShiftToCC(shift, settings);
    _capoMidiSend(settings.channel, settings.cc, value);
    console.log(`[MIDI] Virtual Capo: tuning=${JSON.stringify(tuning)}, shift=${shift}, CC#${settings.cc}=${value}`);
}

function _capoResend() {
    if (_capoLastShift === null) return;
    const settings = _capoGetSettings();
    const outputId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    if (!settings.enabled || (!_capoMidiOutput && outputId !== 'internal' && !hasInternal)) return;
    const value = _capoShiftToCC(_capoLastShift, settings);
    _capoMidiSend(settings.channel, settings.cc, value);
    console.log(`[MIDI] Virtual Capo: resend shift=${_capoLastShift}, CC#${settings.cc}=${value}`);
}

function _capoReset() {
    _capoLastTitle = null;
    _capoLastArrangement = null;
    _capoLastTuningOffsets = null;
    _capoLastShift = null;
    _capoDisengaged = false;
    _capoSendCenter();
    const btn = document.getElementById('btn-capo');
    if (btn) btn.remove();
}

// ── Player Integration ──────────────────────────────────────────────────

function _capoOnSongLoad(filename, arrangement) {
    _capoLastTitle = null;
    _capoLastArrangement = null;
    _capoLastTuningOffsets = null;
    _capoLastFilename = filename;
    // Return the fetch promise so caller can await if needed
    return _capoFetchTuning(filename, arrangement);
}

function _capoOnSongReady(tuningPromise) {
    _capoInjectBadge();
    tuningPromise.then(offsets => {
        if (offsets) {
            const info = highway.getSongInfo();
            _capoLastTuningOffsets = offsets;
            _capoLastTitle = info?.title || '';
            _capoLastArrangement = info?.arrangement || '';
            _capoSend(offsets);
        }
    }).catch(() => {});
}

function _capoOnArrangementChange(filename, arrangement) {
    _capoLastArrangement = arrangement;
    _capoFetchTuning(filename, arrangement).then(offsets => {
        if (offsets) {
            _capoLastTuningOffsets = offsets;
            _capoSend(offsets);
        }
    }).catch(() => {});
}

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
        _capoMidiSend(settings.channel, settings.cc, _capoShiftToCC(0, settings));
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
    btn.title = _capoTuningLabel(_capoLastTuningOffsets);
    if (_capoDisengaged) {
        _capoDisengaged = false;
        _capoStyleBadge();
    }
}

// ── Hooks into core ─────────────────────────────────────────────────────

// Wrap playSong: start tuning fetch in parallel with song load
(function() {
    const origPlaySong = window.playSong;
    window.playSong = async function(filename, arrangement) {
        const tuningPromise = _capoOnSongLoad(filename, arrangement);
        await origPlaySong(filename, arrangement);
        _capoOnSongReady(tuningPromise);
    };
})();

// Wrap changeArrangement: re-fetch tuning for the new path
(function() {
    const origChangeArrangement = window.changeArrangement;
    window.changeArrangement = function(index) {
        origChangeArrangement(index);
        // Look up arrangement name from the dropdown
        const sel = document.getElementById('arr-select');
        const opt = sel?.options[sel.selectedIndex];
        const arrName = opt ? opt.textContent.replace(/\s*\(.*\)$/, '') : '';
        if (_capoLastFilename) {
            _capoOnArrangementChange(_capoLastFilename, arrName);
        }
    };
})();

// Wrap highway.stop: send center CC when player closes
(function() {
    const origStop = highway.stop;
    highway.stop = function() {
        origStop.call(highway);
        if (_capoGetSettings().resetOnStop) _capoReset();
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
        const profileName = (_capoProfiles[settings.profile] || _capoProfiles.standard).name;
        el.innerHTML = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 text-xs text-gray-500">
            Virtual Capo enabled — ${esc(profileName)} (CC#${settings.cc}, Ch${settings.channel}) — no song loaded</div>`;
        return;
    }
    const shift = _capoCalcShift(tuning);
    const val = _capoShiftToCC(shift, settings);
    const name = _capoTuningLabel(tuning);
    const profileName = (_capoProfiles[settings.profile] || _capoProfiles.standard).name;
    el.innerHTML = `<div class="bg-dark-700/50 border border-amber-800/30 rounded-xl p-3 flex items-center gap-3 text-xs">
        <span class="text-amber-400 font-semibold">Virtual Capo</span>
        <span class="text-gray-500">${esc(profileName)}</span>
        <span class="text-gray-400">${name}</span>
        <span class="text-gray-400">Shift: ${shift >= 0 ? '+' : ''}${shift}</span>
        <span class="text-gray-500">CC#${settings.cc} Ch${settings.channel} → ${val}</span>
    </div>`;
}

function _capoOnProfileChange(profileKey) {
    const profile = _capoProfiles[profileKey] || _capoProfiles.standard;
    _capoSaveSetting('midi_capo_profile', profileKey);
    _capoSaveSetting('midi_capo_cc', String(profile.defaultCC || 18));
    _capoSaveSetting('midi_capo_min_shift', String(profile.minShift));
    _capoSaveSetting('midi_capo_max_shift', String(profile.maxShift));
    _capoSaveSetting('midi_capo_cc_min', String(profile.ccMin));
    _capoSaveSetting('midi_capo_cc_max', String(profile.ccMax));
    _capoLoadSettings();
}

function _capoLoadSettings() {
    const en = document.getElementById('midi-capo-enabled');
    const ch = document.getElementById('midi-capo-channel');
    const cc = document.getElementById('midi-capo-cc');
    const ros = document.getElementById('midi-capo-reset-on-stop');
    const prof = document.getElementById('midi-capo-profile');
    if (en) en.checked = localStorage.getItem('midi_capo_enabled') === 'true';
    if (ch) ch.value = localStorage.getItem('midi_capo_channel') || '0';
    if (cc) cc.value = localStorage.getItem('midi_capo_cc') || '18';
    if (ros) ros.checked = localStorage.getItem('midi_capo_reset_on_stop') === 'true';
    let profileKey = localStorage.getItem('midi_capo_profile') || 'standard';
    if (!_capoProfiles[profileKey]) profileKey = 'standard';
    const profile = _capoProfiles[profileKey];
    if (prof) prof.value = profileKey;
    // Populate range fields (always visible, always editable)
    const ms = document.getElementById('midi-capo-min-shift');
    const xs = document.getElementById('midi-capo-max-shift');
    const cm = document.getElementById('midi-capo-cc-min');
    const cx = document.getElementById('midi-capo-cc-max');
    if (ms) ms.value = localStorage.getItem('midi_capo_min_shift') || String(profile.minShift);
    if (xs) xs.value = localStorage.getItem('midi_capo_max_shift') || String(profile.maxShift);
    if (cm) cm.value = localStorage.getItem('midi_capo_cc_min') || String(profile.ccMin);
    if (cx) cx.value = localStorage.getItem('midi_capo_cc_max') || String(profile.ccMax);
    // Update test shift range
    const settings = _capoGetSettings();
    const testShift = document.getElementById('capo-test-shift');
    if (testShift) {
        testShift.min = settings.minShift;
        testShift.max = settings.maxShift;
    }
}

// Hydrate settings inputs once DOM is ready
setTimeout(_capoLoadSettings, 100);

// Init MIDI on page load (no UI update — screen may not be visible)
_capoInitMidi(false);

// Init on screen show
(function() {
    const origShowScreen = window.showScreen;
    window.showScreen = function(id) {
        origShowScreen(id);
        if (id === 'plugin-midi_capo') {
            _capoInitMidi(true);
            _capoUpdateStatus();
        }
        if (id === 'settings') {
            _capoLoadSettings();
        }
    };
})();
