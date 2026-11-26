const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
const NativeAudioBuffer = window.AudioBuffer;

const CTX_STATE = { suspended: 0, running: 1, closed: 2 };

function waNative(x) {
	return x == null ? null : x.native;
}

function waF32(a) {
	if (a == null || a instanceof Float32Array) return a;
	return Float32Array.from(a);
}

class AudioParam {
	constructor() {
		this.native = null;
		this.context = null;
	}
	$ctor(context, defaultValue, minValue, maxValue, audioRate) {
		this.context = context;
		this._def = { defaultValue, minValue, maxValue, audioRate };
		return this;
	}
	static wrap(context, nativeParam) {
		const p = new AudioParam();
		p.context = context;
		p.native = nativeParam;
		return p;
	}
	get defaultValue() { return this.native.defaultValue; }
	get minValue() { return this.native.minValue; }
	get maxValue() { return this.native.maxValue; }
	get isAudioRate() { return this.native.automationRate === 'a-rate'; }
	get value() { return this.native.value; }
	set value(v) { this.native.value = v; }
	SetValueAtTime(value, startTime) {
		this.native.setValueAtTime(value, startTime);
		return this;
	}
	LinearRampToValueAtTime(value, endTime) {
		this.native.linearRampToValueAtTime(value, endTime);
		return this;
	}
	ExponentialRampToValueAtTime(value, endTime) {
		this.native.exponentialRampToValueAtTime(value, endTime);
		return this;
	}
	SetTargetAtTime(target, startTime, timeConstant) {
		if (timeConstant === 0) this.native.setValueAtTime(target, startTime);
		else this.native.setTargetAtTime(target, startTime, timeConstant);
		return this;
	}
	CancelScheduledValues(cancelTime) {
		this.native.cancelScheduledValues(cancelTime);
		return this;
	}
}

class AudioBuffer {
	constructor() {
		this.native = null;
	}
	$ctor(numberOfChannels, length, sampleRate) {
		this.native = new NativeAudioBuffer({ numberOfChannels, length, sampleRate });
		return this;
	}
	static wrap(nativeBuffer) {
		const b = new AudioBuffer();
		b.native = nativeBuffer;
		return b;
	}
	get numberOfChannels() { return this.native.numberOfChannels; }
	get length_() { return this.native.length; }
	get sampleRate() { return this.native.sampleRate; }
	get duration() { return this.native.duration; }
	GetChannelData(channel) { return this.native.getChannelData(channel); }
}

class PeriodicWave {
	constructor() {
		this.native = null;
	}
}

class AudioNode {
	constructor() {
		this.native = null;
		this.context = null;
	}
	$ctor(context) {
		this.context = context;
		this.native = this._make(context.native);
		this._params();
		return this;
	}
	_make() { throw new Error('audio node factory missing'); }
	_params() {}
	_param(nativeParam) {
		return nativeParam == null ? null : AudioParam.wrap(this.context, nativeParam);
	}
	Connect$AudioNode(destination) {
		this.native.connect(destination.native);
		return destination;
	}
	Connect$AudioParam(destination) {
		this.native.connect(destination.native);
	}
	Disconnect() {
		this.native.disconnect();
	}
}

class AudioDestinationNode extends AudioNode {
	$ctor(context) {
		this.context = context;
		this.native = context.native.destination;
		return this;
	}
}

class AudioScheduledSourceNode extends AudioNode {
	Start$d(when) {
		this.native.start(when === undefined ? 0 : when);
	}
	Stop(when) {
		this.native.stop(when === undefined ? 0 : when);
	}
}

class AudioBufferSourceNode extends AudioScheduledSourceNode {
	_make(c) { return c.createBufferSource(); }
	_params() {
		this.playbackRate = this._param(this.native.playbackRate);
		this.detune = this._param(this.native.detune);
		this._buffer = null;
	}
	get buffer() { return this._buffer; }
	set buffer(b) {
		this._buffer = b;
		this.native.buffer = waNative(b);
	}
	get loop() { return this.native.loop; }
	set loop(v) { this.native.loop = !!v; }
	get loopStart() { return this.native.loopStart; }
	set loopStart(v) { this.native.loopStart = v; }
	get loopEnd() { return this.native.loopEnd; }
	set loopEnd(v) { this.native.loopEnd = v; }
	Start$d$d(when, offset) {
		this.native.start(when, offset);
	}
	Start$d$d$d(when, offset, duration) {
		this.native.start(when, offset, duration);
	}
}

class OscillatorNode extends AudioScheduledSourceNode {
	_make(c) { return c.createOscillator(); }
	_params() {
		this.frequency = this._param(this.native.frequency);
		this.detune = this._param(this.native.detune);
	}
	get type() { return this.native.type; }
	set type(v) { this.native.type = v; }
	SetPeriodicWave(periodicWave) {
		this.native.setPeriodicWave(periodicWave.native);
	}
}

class GainNode extends AudioNode {
	_make(c) { return c.createGain(); }
	_params() { this.gain = this._param(this.native.gain); }
}

class BiquadFilterNode extends AudioNode {
	_make(c) { return c.createBiquadFilter(); }
	_params() {
		this.frequency = this._param(this.native.frequency);
		this.detune = this._param(this.native.detune);
		this.gain = this._param(this.native.gain);
		this.Q = this._param(this.native.Q);
	}
	get type() { return this.native.type; }
	set type(v) { this.native.type = v; }
}

class StereoPannerNode extends AudioNode {
	_make(c) { return c.createStereoPanner(); }
	_params() { this.pan = this._param(this.native.pan); }
}

class DynamicsCompressorNode extends AudioNode {
	_make(c) { return c.createDynamicsCompressor(); }
	_params() {
		this.threshold = this._param(this.native.threshold);
		this.knee = this._param(this.native.knee);
		this.ratio = this._param(this.native.ratio);
		this.attack = this._param(this.native.attack);
		this.release = this._param(this.native.release);
	}
}

class WaveShaperNode extends AudioNode {
	_make(c) { return c.createWaveShaper(); }
	get curve() { return this._curve === undefined ? null : this._curve; }
	set curve(v) {
		this._curve = v;
		this.native.curve = waF32(v);
	}
	get oversample() { return this.native.oversample; }
	set oversample(v) { this.native.oversample = v; }
}

function waResample(nativeCtx, buf) {
	const rate = nativeCtx.sampleRate;
	if (buf.sampleRate === rate) return buf;
	const len = Math.max(1, Math.round(buf.length * rate / buf.sampleRate));
	const out = new NativeAudioBuffer({ numberOfChannels: buf.numberOfChannels, length: len, sampleRate: rate });
	const k = (buf.length - 1) / Math.max(1, len - 1);
	for (let ch = 0; ch < buf.numberOfChannels; ch++) {
		const src = buf.getChannelData(ch);
		const dst = out.getChannelData(ch);
		for (let i = 0; i < len; i++) {
			const p = i * k;
			const i0 = Math.floor(p);
			const i1 = Math.min(i0 + 1, buf.length - 1);
			dst[i] = src[i0] + (src[i1] - src[i0]) * (p - i0);
		}
	}
	return out;
}

class ConvolverNode extends AudioNode {
	_make(c) { return c.createConvolver(); }
	get normalize() { return this.native.normalize; }
	set normalize(v) { this.native.normalize = !!v; }
	get buffer() { return this._buffer === undefined ? null : this._buffer; }
	set buffer(b) {
		this._buffer = b;
		this.native.buffer = b == null ? null : waResample(this.context.native, b.native);
	}
}

class AudioContext {
	constructor() {
		this.native = null;
		this.sync = {};
		this.persistentNodes = false;
		this.destination = null;
	}
	$ctor(sampleRate) {
		if (!(sampleRate >= 3000 && sampleRate <= 768000)) {
			throw new RangeError('unsupported sample rate ' + sampleRate);
		}
		const make = AudioContext.nativeFactory ||
			((sr) => new NativeAudioContext({ sampleRate: sr, latencyHint: 'interactive' }));
		this.native = make(sampleRate);
		this.destination = new AudioDestinationNode().$ctor(this);
		return this;
	}
	get sampleRate() { return this.native.sampleRate; }
	get currentTime() { return this.native.currentTime; }
	get state() {
		const s = CTX_STATE[this.native.state];
		return s === undefined ? 0 : s;
	}
	Resume() {
		if (typeof this.native.resume === 'function' && this.native.state !== 'closed') {
			this.native.resume().catch(() => {});
		}
	}
	Suspend() {
		if (typeof this.native.suspend === 'function' && this.native.state !== 'closed') {
			this.native.suspend().catch(() => {});
		}
	}
	Close() {
		if (typeof this.native.close === 'function' && this.native.state !== 'closed') {
			this.native.close().catch(() => {});
		}
	}
	TakeRenderError() { return null; }
	CreateGain() { return new GainNode().$ctor(this); }
	CreateOscillator() { return new OscillatorNode().$ctor(this); }
	CreateBiquadFilter() { return new BiquadFilterNode().$ctor(this); }
	CreateBufferSource() { return new AudioBufferSourceNode().$ctor(this); }
	CreateStereoPanner() { return new StereoPannerNode().$ctor(this); }
	CreateConvolver() { return new ConvolverNode().$ctor(this); }
	CreateDynamicsCompressor() { return new DynamicsCompressorNode().$ctor(this); }
	CreateWaveShaper() { return new WaveShaperNode().$ctor(this); }
	CreateBuffer(numberOfChannels, length, bufferSampleRate) {
		return new AudioBuffer().$ctor(numberOfChannels, length, bufferSampleRate);
	}
	CreatePeriodicWave(real, imag, disableNormalization) {
		const w = new PeriodicWave();
		w.native = this.native.createPeriodicWave(waF32(real), waF32(imag),
			{ disableNormalization: !!disableNormalization });
		return w;
	}
}
AudioContext.nativeFactory = null;

let waProbedRate = 0;

class AudioOutput {
	static get Stalled() { return false; }
	static OutputSampleRate() {
		if (waProbedRate > 0) return waProbedRate;
		if (!NativeAudioContext) return 0;
		try {
			const probe = new NativeAudioContext();
			waProbedRate = probe.sampleRate;
			probe.close().catch(() => {});
		} catch (e) {
			return 0;
		}
		return waProbedRate;
	}
	static Attach(context) {}
	static Detach() {}
}

async function preloadSfx(ctxWrapper, names, urlFor) {
	const out = new Map();
	const queue = names.slice();
	const failed = [];
	async function worker() {
		while (queue.length > 0) {
			const name = queue.shift();
			try {
				const res = await fetch(urlFor(name));
				if (!res.ok) throw new Error('http ' + res.status);
				const bytes = await res.arrayBuffer();
				const decoded = await ctxWrapper.native.decodeAudioData(bytes);
				out.set(name, AudioBuffer.wrap(decoded));
			} catch (e) {
				failed.push(name + ': ' + (e && e.message ? e.message : e));
			}
		}
	}
	const n = Math.min(8, queue.length);
	const workers = [];
	for (let i = 0; i < n; i++) workers.push(worker());
	await Promise.all(workers);
	if (failed.length > 0) console.warn('preloadSfx: ' + failed.length + ' sample(s) failed', failed.slice(0, 10));
	return out;
}

// G.SFX looks samples up by mixed-case name ("barbStomp_0", "Nature/V2/rain"); the map is keyed by lower-case path.
function sfxSource(map) {
	return (name) => {
		const hit = map.get(String(name).toLowerCase());
		return hit === undefined ? null : hit;
	};
}

// SmpBytes returns a wrapper AudioBuffer from sfxSource, so DecodeWav only has to pass it through.
function sfxDecodeWav(ctx, b) {
	return b instanceof AudioBuffer ? b : null;
}

window.WebAudioHost = { preloadSfx, sfxSource, sfxDecodeWav, NativeAudioContext, NativeAudioBuffer };
