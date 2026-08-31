# Audio

MegaPlay Hub generates **all** of its sound effects and background music at runtime
with the Web Audio API (`js/systems/audioManager.js`) — oscillators, noise buffers
and envelopes. That means:

- zero audio downloads, so the platform works fully offline,
- no licensing concerns,
- instant load times.

Drop `.mp3` / `.ogg` files here only if you want to extend `AudioManager` with
sampled audio; nothing in the current build requires them.
