// Sinh bởi tools/miasma.py (U3 miasma: FogDevil, MONSTERS.md §2.2). Không sửa tay.
window.DR_MIASMA = {
 "aggroEmit": {
  "aggro": 15,
  "main": 3
 },
 "chase": {
  "lifetimeMul": 0.1,
  "maxParticles": 5,
  "noiseK": 3.0
 },
 "idle": {
  "homeSpeed": 2.0,
  "lifetimeMul": 1.0,
  "maxParticles": 2,
  "noise": 0.0
 },
 "instances": [
  {
   "appearTime": 0.84,
   "audio": {
    "loop": true,
    "max": 30.0,
    "min": 1.0,
    "volume": 0.5
   },
   "audioVolume": 0.5,
   "chaseColor": [
    0.76415,
    0.29645,
    0.29196,
    1.0
   ],
   "chaseDistance": 20.0,
   "disappearTime": 0.17,
   "idleColor": [
    1.0,
    1.0,
    1.0,
    0.96471
   ],
   "minimumDepthSpawn": 0.05,
   "name": "FogDevil",
   "phase": 1,
   "retrySec": 1.0,
   "sanity": {
    "fullValueDay": 0.0,
    "fullValueNight": -10.0,
    "fullValueRadius": 2.0,
    "partialValueMinDay": 0.0,
    "partialValueMinNight": 0.0,
    "partialValueRadius": 10.0
   },
   "spawnArcRadius": 60.0,
   "spawnDistance": 50.0,
   "spawnDistanceRandomOffset": 30.0,
   "speed": 0.15,
   "x": 100.0,
   "z": -75.0
  },
  {
   "appearTime": 0.84,
   "audio": {
    "loop": true,
    "max": 30.0,
    "min": 1.0,
    "volume": 0.5
   },
   "audioVolume": 0.5,
   "chaseColor": [
    0.76415,
    0.29645,
    0.29196,
    1.0
   ],
   "chaseDistance": 20.0,
   "disappearTime": 0.17,
   "idleColor": [
    1.0,
    1.0,
    1.0,
    0.96471
   ],
   "minimumDepthSpawn": 0.05,
   "name": "FogDevil (1)",
   "phase": 3,
   "retrySec": 1.0,
   "sanity": {
    "fullValueDay": 0.0,
    "fullValueNight": -10.0,
    "fullValueRadius": 2.0,
    "partialValueMinDay": 0.0,
    "partialValueMinNight": 0.0,
    "partialValueRadius": 10.0
   },
   "spawnArcRadius": 60.0,
   "spawnDistance": 50.0,
   "spawnDistanceRandomOffset": 30.0,
   "speed": 0.15,
   "x": 100.0,
   "z": 0.0
  }
 ],
 "neutral": {
  "aggroSec": 0.1,
  "calmSec": 1.0,
  "start": 0.0
 },
 "src": "Scenes/Game.unity:FogDevilContainer/FogDevil{,(1)}; FogDevil.cs"
};
