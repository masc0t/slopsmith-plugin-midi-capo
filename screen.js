// MIDI Capo plugin
// Auto-sets pitch shift via MIDI CC/PC based on song tuning.

const _capoProfiles = {
    standard:  { name: 'Standard (Fractal, Helix, etc.)', minShift: -24, maxShift: 24, ccMin: 0,  ccMax: 127, defaultCC: 18, ccBypass: 0 },
    kemper:    { name: 'Kemper',                          minShift: -36, maxShift: 36, ccMin: 28, ccMax: 100, defaultCC: 38, ccBypass: 28 },
    whammy_dt_drop: {
        name: 'DigiTech Whammy DT',
        type: 'pc',
        minShift: -12, maxShift: 12,
        ccMin: 52, ccMax: 49, ccBypass: 78,
        ccDepth: 11,
        mapping: {
            '12': 49,
            '11': 48, '10': 48, '9': 48, '8': 48, '7': 48,
            '6': 47, '5': 46, '4': 45, '3': 44, '2': 43, '1': 42,
            '0': 78,
            '-1': 59, '-2': 58, '-3': 57, '-4': 56, '-5': 55, '-6': 54,
            '-7': 53, '-8': 53, '-9': 53, '-10': 53, '-11': 53,
            '-12': 52
        },
        // Each active Drop Tune PC has a dedicated bypass PC (active + 18).
        // PC 78 alone does not disengage Drop Tune mode; the per-preset bypass PC must be sent.
        bypassMap: {
            '42': 60, '43': 61, '44': 62, '45': 63, '46': 64, '47': 65, '48': 66, '49': 67,
            '52': 70, '53': 71, '54': 72, '55': 73, '56': 74, '57': 75, '58': 76, '59': 77
        },
        depthSlots: [
            { pc: 0, semitones:  24 }, { pc: 1, semitones:  12 },
            { pc: 2, semitones:   7 }, { pc: 3, semitones:   5 }, { pc: 4, semitones:  2 },
            { pc: 5, semitones:  -5 }, { pc: 6, semitones:  -7 },
            { pc: 7, semitones: -12 }, { pc: 8, semitones: -24 }, { pc: 9, semitones: -36 }
        ]
    },
    custom:    { name: 'Custom',                          minShift: -24, maxShift: 24, ccMin: 0,  ccMax: 127, defaultCC: 18, ccBypass: 0 },
};

let _capoMidiAccess = null;
let _capoMidiOutput = null;
let _capoLastTitle = null;
let _capoLastShift = null;
let _capoLastTuning = null;          // { tuning: number[6], centOffsetResidual: number }
let _capoLastArrangement = null;
let _capoLastFilename = null;
let _capoDisengaged = false;
let _capoSettings = null;

// ── Settings (cached) ──────────────────────────────────────────────────

function _capoGetSettings() {
    if (!_capoSettings) {
        const profileKey = localStorage.getItem('midi_capo_profile') || 'standard';
        const profile = _capoProfiles[profileKey] || _capoProfiles.standard;
        const mappingStr = localStorage.getItem('midi_capo_mapping') || '';
        const mapping = {};
        if (mappingStr) {
            mappingStr.split(',').forEach(pair => {
                const parts = pair.split(':').map(x => x.trim());
                if (parts.length >= 2) {
                    const s = parts[0], v = parts[1];
                    if (s !== '' && v !== '') mapping[s] = parseInt(v);
                }
            });
        }

        _capoSettings = {
            enabled: localStorage.getItem('midi_capo_enabled') === 'true',
            profile: profileKey,
            type: localStorage.getItem('midi_capo_type') || profile.type || 'cc',
            channel: parseInt(localStorage.getItem('midi_capo_channel') || '0'),
            cc: parseInt(localStorage.getItem('midi_capo_cc') || String(profile.defaultCC || 0)),
            resetOnStop: localStorage.getItem('midi_capo_reset_on_stop') === 'true',
            minShift: parseInt(localStorage.getItem('midi_capo_min_shift') || String(profile.minShift)),
            maxShift: parseInt(localStorage.getItem('midi_capo_max_shift') || String(profile.maxShift)),
            ccMin: parseInt(localStorage.getItem('midi_capo_cc_min') || String(profile.ccMin)),
            ccMax: parseInt(localStorage.getItem('midi_capo_cc_max') || String(profile.ccMax)),
            ccBypass: parseInt(localStorage.getItem('midi_capo_cc_bypass') || String(profile.ccBypass)),
            mapping: mapping
        };
    }
    return _capoSettings;
}

function _capoSaveSetting(key, value) {
    localStorage.setItem(key, value);
    _capoSettings = null; // invalidate cache
}

// ── MIDI Initialization ──────────────────────────────────────────────────

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
        const statusByte = 0xB0 | (ch & 0x0F);

        for (const slot of slots) {
            api.sendMidiToSlot(slot.id, 1, ch + 1, cc & 0x7F, value & 0x7F);
            api.sendMidiToSlot(slot.id, 0, statusByte, cc & 0x7F, value & 0x7F);
        }
    } catch (err) {
        console.error('[MIDI] Internal CC route failed:', err);
    }
}

async function _capoSendPCToInternal(channel, value) {
    const api = window.slopsmithDesktop?.audio;
    if (!api || !api.sendMidiToSlot) return;

    try {
        const chain = await api.getChainState();
        const slots = chain.filter(s => s.type === 0);
        if (slots.length === 0) return;

        const ch = parseInt(channel);
        const statusByte = 0xC0 | (ch & 0x0F);

        for (const slot of slots) {
            api.sendMidiToSlot(slot.id, 1, ch + 1, value & 0x7F, 0);
            api.sendMidiToSlot(slot.id, 0, statusByte, value & 0x7F, 0);
        }
    } catch (err) {
        console.error('[MIDI] Internal PC route failed:', err);
    }
}

function _capoMidiSend(channel, cc, value, forceType) {
    const settings = _capoGetSettings();
    const savedId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    const type = forceType || settings.type;

    if (type === 'pc') {
        if (savedId === 'internal' || (hasInternal && !savedId)) {
            _capoSendPCToInternal(channel, value);
            return;
        }
        if (!_capoMidiOutput) return;
        const ch = channel & 0x0F;
        _capoMidiOutput.send([0xC0 | ch, value & 0x7F]);
        return;
    }

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
    const profile = _capoProfiles[settings.profile];
    const shift = parseInt(document.getElementById('capo-test-shift').value) || 0;
    const value = (shift === 0 && profile?.bypassMap && _capoLastShift)
        ? _capoGetBypassPC(profile, _capoLastShift, settings)
        : _capoShiftToCC(shift, settings);
    _capoMidiSend(settings.channel, settings.cc, value);
}

// ── Capo Logic ─────────────────────────────────────────────────────────

function _capoFetchTuning(filename, arrangement) {
    let url = `/api/plugins/midi_capo/tuning/${encodeURIComponent(decodeURIComponent(filename))}`;
    if (arrangement) url += `?arrangement=${encodeURIComponent(arrangement)}`;
    return fetch(url)
        .then(r => r.json())
        .then(data => data.tuning ? { tuning: data.tuning, centOffsetResidual: data.centOffsetResidual || 0 } : null);
}

function _capoCalcShift(tuning) {
    if (!tuning || tuning.length < 6) return 0;
    const [s0, s1, s2, s3, s4, s5] = tuning;
    if (s0 === s1 - 2) return s1;
    if (s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4 && s4 === s5) return s0;
    if (s0 === s1 && s1 === s2 && s2 === s3 && s4 === s1 + 1 && (s5 === s1 || s5 === s1 + 1)) return s1;
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
    const isCustom = s.profile === 'custom';

    // 1. Dedicated Bypass value for 0 shift
    if (shift === 0) return s.ccBypass;

    // 2. Custom manual mapping (highest priority if custom)
    if (isCustom && s.mapping && s.mapping[String(shift)] !== undefined) {
        return s.mapping[String(shift)];
    }

    const profile = _capoProfiles[s.profile];
    // 3. Built-in profile mapping
    if (profile && profile.mapping && profile.mapping[String(shift)] !== undefined) {
        return profile.mapping[String(shift)];
    }

    // 4. Fallback for built-in PC profiles
    if (s.type === 'pc' && profile && profile.mapping) {
        if (shift > 0) return profile.mapping['0'] ?? s.ccBypass;
        if (shift < profile.minShift) return profile.mapping[String(profile.minShift)] || profile.mapping['0'] || s.ccBypass;
        return profile.mapping['0'] ?? s.ccBypass;
    }

    // 5. Linear calculation fallback (CC or simple PC ranges)
    const clamped = Math.max(s.minShift, Math.min(s.maxShift, shift));
    const range = s.maxShift - s.minShift;
    if (range === 0) return s.ccMin;
    const cc = s.ccMin + (clamped - s.minShift) / range * (s.ccMax - s.ccMin);
    return Math.max(Math.min(s.ccMin, s.ccMax), Math.min(Math.max(s.ccMin, s.ccMax), Math.round(cc)));
}

function _capoGetBypassPC(profile, activeShift, settings) {
    const activePC = profile.mapping?.[String(activeShift)];
    if (activePC == null) return settings.ccBypass;
    return profile.bypassMap[String(activePC)] ?? settings.ccBypass;
}

function _capoChannelReady(settings) {
    const outputId = localStorage.getItem('midi_output_id');
    const hasInternal = !!(window.slopsmithDesktop?.audio);
    return settings.enabled && (_capoMidiOutput || outputId === 'internal' || hasInternal);
}

function _capoSendCenter() {
    const settings = _capoGetSettings();
    if (!_capoChannelReady(settings)) return;
    _capoMidiSend(settings.channel, settings.cc, settings.ccBypass);
}

function _capoSend(t) {
    const settings = _capoGetSettings();
    if (!_capoChannelReady(settings)) return;

    const shift = _capoCalcShift(t.tuning);
    const drop = _capoIsDrop(t.tuning);
    const cents = t.centOffsetResidual || 0;
    const prevShift = _capoLastShift;
    _capoLastShift = shift;
    _capoUpdateBadge(shift, drop, cents);
    if (_capoDisengaged) return;

    const profile = _capoProfiles[settings.profile];
    if (profile?.depthSlots && cents !== 0) {
        _capoSendDepthCorrection(settings, profile, shift, cents);
    } else {
        const value = (shift === 0 && profile?.bypassMap && prevShift)
            ? _capoGetBypassPC(profile, prevShift, settings)
            : _capoShiftToCC(shift, settings);
        _capoMidiSend(settings.channel, settings.cc, value);
    }
}

function _capoSendDepthCorrection(settings, profile, shift, residualCents) {
    // Mirrors RSMods AutoTrueTuningPastLimits: combine shift + cents into a Whammy-side PC + CC#11 depth.
    // Pick the smallest-magnitude same-sign slot that still covers the target — preserves CC resolution.
    const targetSemis = shift + residualCents / 100;
    const sign = Math.sign(targetSemis);
    const sameSign = profile.depthSlots
        .filter(s => Math.sign(s.semitones) === sign)
        .sort((a, b) => Math.abs(a.semitones) - Math.abs(b.semitones));
    const slot = sameSign.find(s => Math.abs(s.semitones) >= Math.abs(targetSemis))
              || sameSign[sameSign.length - 1];
    const cc = Math.max(0, Math.min(127, Math.round(targetSemis * 127 / slot.semitones)));
    _capoMidiSend(settings.channel, settings.cc, slot.pc, 'pc');
    _capoMidiSend(settings.channel, profile.ccDepth, cc, 'cc');
}

function _capoResend() {
    if (_capoLastShift === null) return;
    const settings = _capoGetSettings();
    if (!_capoChannelReady(settings)) return;
    const profile = _capoProfiles[settings.profile];
    const cents = _capoLastTuning?.centOffsetResidual || 0;
    if (profile?.depthSlots && cents !== 0) {
        _capoSendDepthCorrection(settings, profile, _capoLastShift, cents);
    } else {
        _capoMidiSend(settings.channel, settings.cc, _capoShiftToCC(_capoLastShift, settings));
    }
}

function _capoReset() {
    const settings = _capoGetSettings();
    const profile = _capoProfiles[settings.profile];
    const prevShift = _capoLastShift;
    _capoLastTitle = null;
    _capoLastArrangement = null;
    _capoLastTuning = null;
    _capoLastShift = null;
    _capoDisengaged = false;
    if (profile?.bypassMap && prevShift) {
        _capoMidiSend(settings.channel, settings.cc, _capoGetBypassPC(profile, prevShift, settings));
    } else {
        _capoSendCenter();
    }
    const btn = document.getElementById('btn-capo');
    if (btn) btn.remove();
}

// ── Player Integration ──────────────────────────────────────────────────

function _capoOnSongLoad(filename, arrangement) {
    _capoLastTitle = null;
    _capoLastArrangement = null;
    _capoLastTuning = null;
    _capoLastFilename = filename;
    return _capoFetchTuning(filename, arrangement);
}

function _capoOnSongReady(tuningPromise) {
    _capoInjectBadge();
    tuningPromise.then(t => {
        if (t) {
            const info = highway.getSongInfo();
            _capoLastTuning = t;
            _capoLastTitle = info?.title || '';
            _capoLastArrangement = info?.arrangement || '';
            _capoSend(t);
        }
    }).catch(() => {});
}

function _capoOnArrangementChange(filename, arrangement) {
    _capoLastArrangement = arrangement;
    _capoFetchTuning(filename, arrangement).then(t => {
        if (t) {
            _capoLastTuning = t;
            _capoSend(t);
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
        const profile = _capoProfiles[settings.profile];
        const value = (profile?.bypassMap && _capoLastShift)
            ? _capoGetBypassPC(profile, _capoLastShift, settings)
            : settings.ccBypass;
        _capoMidiSend(settings.channel, settings.cc, value);
    }
    _capoStyleBadge();
}

function _capoStyleBadge() {
    const btn = document.getElementById('btn-capo');
    if (!btn) return;
    if (_capoDisengaged) {
        btn.className = 'px-3 py-1.5 bg-dark-600 hover:bg-dark-500 rounded-lg text-xs text-gray-500 transition line-through';
    } else {
        btn.className = 'px-3 py-1.5 bg-amber-900/40 hover:bg-amber-900/60 rounded-lg text-xs text-amber-300 transition';
    }
}

function _capoUpdateBadge(shift, drop, cents) {
    const btn = document.getElementById('btn-capo');
    if (!btn) return;
    const label = drop ? 'Drop' : 'Standard';
    const centsStr = cents ? ` ${cents > 0 ? '+' : ''}${cents}¢` : '';
    btn.textContent = `${label} ${shift >= 0 ? '+' : ''}${shift}${centsStr}`;
    btn.title = _capoTuningLabel(_capoLastTuning?.tuning);
    if (_capoDisengaged) {
        _capoDisengaged = false;
        _capoStyleBadge();
    }
}

// ── Hooks ─────────────────────────────────────────────────────────────

(function() {
    const origPlaySong = window.playSong;
    window.playSong = async function(filename, arrangement) {
        const tuningPromise = _capoOnSongLoad(filename, arrangement);
        await origPlaySong(filename, arrangement);
        _capoOnSongReady(tuningPromise);
    };

    const origChangeArrangement = window.changeArrangement;
    window.changeArrangement = function(index) {
        origChangeArrangement(index);
        const sel = document.getElementById('arr-select');
        const opt = sel?.options[sel.selectedIndex];
        const arrName = opt ? opt.textContent.replace(/\s*\(.*\)$/, '') : '';
        if (_capoLastFilename) _capoOnArrangementChange(_capoLastFilename, arrName);
    };

    const origStop = highway.stop;
    highway.stop = function() {
        origStop.call(highway);
        if (_capoGetSettings().resetOnStop) _capoReset();
    };
})();

// ── Status & Settings ──────────────────────────────────────────────────

function _capoUpdateStatus() {
    const el = document.getElementById('capo-status');
    if (!el) return;
    const settings = _capoGetSettings();
    if (!settings.enabled) {
        el.innerHTML = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 text-xs text-gray-500">Virtual Capo is disabled. Enable it in Settings.</div>`;
        return;
    }
    const tuning = _capoLastTuning?.tuning;
    const cents = _capoLastTuning?.centOffsetResidual || 0;
    const profileName = (_capoProfiles[settings.profile] || _capoProfiles.standard).name;
    if (!tuning) {
        el.innerHTML = `<div class="bg-dark-700/50 border border-gray-800/50 rounded-xl p-3 text-xs text-gray-500">Virtual Capo enabled — ${esc(profileName)} (CC#${settings.cc}, Ch${settings.channel}) — no song loaded</div>`;
        return;
    }
    const shift = _capoCalcShift(tuning);
    const val = _capoShiftToCC(shift, settings);
    const name = _capoTuningLabel(tuning);
    const label = settings.type === 'pc' ? 'PC' : `CC#${settings.cc}`;
    const centsStr = cents ? ` <span class="text-amber-400">${cents > 0 ? '+' : ''}${cents}¢</span>` : '';
    el.innerHTML = `<div class="bg-dark-700/50 border border-amber-800/30 rounded-xl p-3 flex items-center gap-3 text-xs">
        <span class="text-amber-400 font-semibold">Virtual Capo</span>
        <span class="text-gray-500">${esc(profileName)}</span>
        <span class="text-gray-400">${name}</span>
        <span class="text-gray-400">Shift: ${shift >= 0 ? '+' : ''}${shift}${centsStr}</span>
        <span class="text-gray-500">${label} Ch${settings.channel} → ${val}</span>
    </div>`;
}

function _capoOnProfileChange(profileKey) {
    const profile = _capoProfiles[profileKey] || _capoProfiles.standard;
    _capoSaveSetting('midi_capo_profile', profileKey);
    _capoSaveSetting('midi_capo_type', profile.type || 'cc');
    _capoSaveSetting('midi_capo_cc', String(profile.defaultCC || 18));
    _capoSaveSetting('midi_capo_min_shift', String(profile.minShift));
    _capoSaveSetting('midi_capo_max_shift', String(profile.maxShift));
    _capoSaveSetting('midi_capo_cc_min', String(profile.ccMin));
    _capoSaveSetting('midi_capo_cc_max', String(profile.ccMax));
    _capoSaveSetting('midi_capo_cc_bypass', String(profile.ccBypass));
    if (profileKey !== 'custom') {
        _capoSaveSetting('midi_capo_mapping', '');
    }
    _capoLoadSettings();
}

function _capoLoadSettings() {
    const en = document.getElementById('midi-capo-enabled');
    const ch = document.getElementById('midi-capo-channel');
    const cc = document.getElementById('midi-capo-cc');
    const ty = document.getElementById('midi-capo-type');
    const ros = document.getElementById('midi-capo-reset-on-stop');
    const prof = document.getElementById('midi-capo-profile');
    const map = document.getElementById('midi-capo-mapping');

    if (en) en.checked = localStorage.getItem('midi_capo_enabled') === 'true';
    if (ch) ch.value = localStorage.getItem('midi_capo_channel') || '0';
    if (cc) cc.value = localStorage.getItem('midi_capo_cc') || '18';
    if (ros) ros.checked = localStorage.getItem('midi_capo_reset_on_stop') === 'true';
    if (map) map.value = localStorage.getItem('midi_capo_mapping') || '';

    let profileKey = localStorage.getItem('midi_capo_profile') || 'standard';
    if (!_capoProfiles[profileKey]) profileKey = 'standard';
    const profile = _capoProfiles[profileKey];
    if (prof) prof.value = profileKey;

    const isCustom = profileKey === 'custom';
    const mode = localStorage.getItem('midi_capo_type') || profile.type || 'cc';
    if (ty) ty.value = mode;

    const modeCont = document.getElementById('capo-mode-container');
    const mapCont = document.getElementById('capo-mapping-container');
    if (modeCont) modeCont.style.display = isCustom ? 'flex' : 'none';
    if (mapCont) mapCont.style.display = 'flex';

    if (map) {
        if (isCustom) {
            map.value = localStorage.getItem('midi_capo_mapping') || '';
            map.disabled = false;
        } else if (profile.mapping) {
            map.value = Object.entries(profile.mapping)
                .sort((a,b) => parseInt(b[0]) - parseInt(a[0]))
                .map(([s, v]) => `${s}:${v}`)
                .join(', ');
            map.disabled = true;
        } else {
            map.value = 'Linear calculation';
            map.disabled = true;
        }
    }

    const ccCont = document.getElementById('capo-cc-container');
    const ccMinCont = document.getElementById('midi-capo-cc-min')?.parentElement;
    const ccMaxCont = document.getElementById('midi-capo-cc-max')?.parentElement;
    const bypassCont = document.getElementById('capo-bypass-container');

    if (ccCont) ccCont.style.display = mode === 'pc' ? 'none' : 'flex';
    if (ccMinCont) ccMinCont.style.display = 'flex';
    if (ccMaxCont) ccMaxCont.style.display = 'flex';
    if (bypassCont) bypassCont.style.display = 'flex';

    if (ccMinCont && mode === 'pc') ccMinCont.querySelector('label').textContent = 'PC for Min';
    if (ccMinCont && mode === 'cc') ccMinCont.querySelector('label').textContent = 'CC Min';
    if (ccMaxCont && mode === 'pc') ccMaxCont.querySelector('label').textContent = 'PC for Max';
    if (ccMaxCont && mode === 'cc') ccMaxCont.querySelector('label').textContent = 'CC Max';

    const bypassLabel = document.getElementById('capo-bypass-label');
    if (bypassLabel) bypassLabel.textContent = mode === 'pc' ? 'PC Bypass' : 'CC Bypass';

    const ms = document.getElementById('midi-capo-min-shift');
    const xs = document.getElementById('midi-capo-max-shift');
    const cm = document.getElementById('midi-capo-cc-min');
    const cx = document.getElementById('midi-capo-cc-max');
    const cb = document.getElementById('midi-capo-cc-bypass');

    if (ms) {
        ms.value = localStorage.getItem('midi_capo_min_shift') || String(profile.minShift);
        ms.disabled = !isCustom;
    }
    if (xs) {
        xs.value = localStorage.getItem('midi_capo_max_shift') || String(profile.maxShift);
        xs.disabled = !isCustom;
    }
    if (cm) {
        cm.value = localStorage.getItem('midi_capo_cc_min') || String(profile.ccMin);
        cm.disabled = !isCustom;
    }
    if (cx) {
        cx.value = localStorage.getItem('midi_capo_cc_max') || String(profile.ccMax);
        cx.disabled = !isCustom;
    }
    if (cb) {
        cb.value = localStorage.getItem('midi_capo_cc_bypass') || String(profile.ccBypass);
        cb.disabled = !isCustom;
    }

    const settings = _capoGetSettings();
    const testShift = document.getElementById('capo-test-shift');
    if (testShift) {
        testShift.min = settings.minShift;
        testShift.max = settings.maxShift;
    }
}


// Hydrate DOM
setTimeout(_capoLoadSettings, 100);

// Init
_capoInitMidi(false);

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
