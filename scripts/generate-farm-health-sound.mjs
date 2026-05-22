/**
 * Regenerates public/sounds/farm-health-alert.wav (four-note ascending alert, ~2.5s).
 * Run: node scripts/generate-farm-health-sound.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const sampleRate = 44100;
const channels = 1;
const notes = [
  { freq: 392, start: 0, dur: 0.58, vol: 0.92 },
  { freq: 523.25, start: 0.52, dur: 0.58, vol: 0.94 },
  { freq: 659.25, start: 1.04, dur: 0.58, vol: 0.96 },
  { freq: 783.99, start: 1.56, dur: 0.88, vol: 0.98 },
];
const totalSec = 2.5;
const totalSamples = Math.floor(totalSec * sampleRate);
const mix = new Float32Array(totalSamples);

function writeTone(mixBuf, freq, startSec, durationSec, volume) {
  const start = Math.floor(startSec * sampleRate);
  const n = Math.floor(durationSec * sampleRate);
  const attack = 0.012;
  const release = 0.14;
  for (let i = 0; i < n; i++) {
    const idx = start + i;
    if (idx >= mixBuf.length) break;
    const t = i / sampleRate;
    const attackEnv = Math.min(1, t / attack);
    const relStart = durationSec - release;
    const releaseEnv = t < relStart ? 1 : Math.max(0, 1 - (t - relStart) / release);
    mixBuf[idx] += Math.sin(2 * Math.PI * freq * t) * volume * attackEnv * releaseEnv;
  }
}

for (const note of notes) writeTone(mix, note.freq, note.start, note.dur, note.vol);
for (let i = 0; i < totalSamples; i++) mix[i] = Math.tanh(mix[i] * 1.15) * 0.98;

const pcm = Buffer.alloc(totalSamples * 2);
for (let i = 0; i < totalSamples; i++) {
  const s = Math.max(-1, Math.min(1, mix[i]));
  pcm.writeInt16LE(Math.round(s * 32767), i * 2);
}

const dataSize = pcm.length;
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + dataSize, 4);
header.write("WAVE", 8);
header.write("fmt ", 12);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(channels, 22);
header.writeUInt32LE(sampleRate, 24);
header.writeUInt32LE(sampleRate * channels * 2, 28);
header.writeUInt16LE(channels * 2, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(dataSize, 40);

const outDir = path.join(root, "public/sounds");
fs.mkdirSync(outDir, { recursive: true });
const wavPath = path.join(outDir, "farm-health-alert.wav");
fs.writeFileSync(wavPath, Buffer.concat([header, pcm]));
console.log(`Wrote ${wavPath} (${fs.statSync(wavPath).size} bytes, ${totalSec}s)`);
