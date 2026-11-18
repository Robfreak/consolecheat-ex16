# Retro-Sound-Effekt-Generator

8-Bit-Soundeffekte wie Sprung, Münze, Explosion und Power-up im Browser erzeugen, anhören und als WAV exportieren. Teil der inoffiziellen consolecheat-Werkzeuge rund um [consolecheat.com](https://consolecheat.com). German is the primary language, English is the other. Light and dark theme, self-hosted fonts, footer, Impressum, and Datenschutz are included.

No account, no tracking, nothing uploaded. Fonts (Outfit, Source Sans 3) are self-hosted from `@fontsource`, so the page makes no request to Google or any other third party. The Impressum fields are placeholders until the operator fills them in. No name or address was invented.

Site: <https://robfreak.github.io/consolecheat-ex16/>

Inoffiziell. Nicht von Sony.

## Features

- **Vorlagen (presets):** Sprung, Münze, Explosion, Power-up, plus Laser and Treffer. Each click rolls new values in a range that fits the sound, after the classic sfxr generators. **Zufall** rolls fully random values that stay audible.
- **Seed:** the field under the waveform shows the seed of the current sound. Type a whole number from 0 to 4294967295 and press Enter or **Aus Seed erzeugen** to regenerate it deterministically with the preset or Zufall you picked last. A hand-edited or loaded sound has no seed, so the field stays empty (`src/sfx/seed.ts`).
- **Regler (sliders), sfxr-style:**
  - Wellenform: Rechteck (with Pulsbreite and Pulsbreiten-Sweep), Sägezahn, Sinus, Dreieck, Rauschen
  - Hüllkurve: Anstieg, Halten, Punch, Abklingen (shown in ms)
  - Tonhöhe: Startfrequenz (Hz), Untergrenze, Gleiten (sweep), Gleit-Änderung (delta slide)
  - Vibrato-Tiefe and -Tempo, Tonsprung (arpeggio) and its timing, Wiederholung
  - Tiefpass with sweep and resonance, Hochpass with sweep
  - Lautstärke
- **Abspielen** uses Web Audio only. The `AudioContext` is created or resumed only inside a click or key press. A canvas shows the waveform. A playhead moves during playback unless `prefers-reduced-motion` is set.
- **Rückgängig / Wiederholen** for every parameter change. A slider drag counts as one step. The stack keeps 100 steps.
- **WAV-Export:** 16-bit PCM, mono, 44.1 kHz, RIFF. The data length matches the rendered sample count exactly.
- **Meine Sounds:** save with a name, list, load, rename, delete. **Als JSON exportieren** / **JSON importieren** move a single sound between browsers. Imports are validated (schema, version, name, every value in range). Unknown fields are dropped.

The synth (`src/sfx/synth.ts`) is a pure function: params in, `Float32Array` out. Noise and every random choice come from a seedable PRNG (`src/sfx/prng.ts`, mulberry32), so the same params and seed always give the same samples. The WAV encoder (`src/sfx/wav.ts`) is pure too.

## Controls

| Action | Keyboard | Controller (standard mapping) |
| --- | --- | --- |
| Abspielen | Space (Leertaste) | × |
| Sprung / Münze / Explosion / Power-up | 1 / 2 / 3 / 4 | D-pad up / right / down / left |
| Zufall | R | △ |
| Rückgängig | Ctrl+Z (Strg+Z, Cmd+Z) | |
| Wiederholen | Ctrl+Y or Ctrl+Shift+Z | |

While a text field has focus, the shortcuts do nothing. A focused button or radio keeps Space for itself. A focused slider keeps its arrow keys but still passes Ctrl+Z and Ctrl+Y. The gamepad is polled with `requestAnimationFrame` and edge-detected, so a held button fires once. The first poll of a pad (also after a reconnect or with a different pad id) only stores the button state, so a button already held when the pad connects or the page loads does nothing. Browsers do not count a gamepad press as a user gesture, so after the page opens, click once or press a key before × can play sound.

Sliders have labels and `<output>` values, the status line is `aria-live`, and focus rings stay visible. The layout works down to 390px.

## Storage

- `consolecheat-sfx-v1` (localStorage): `{ "schema": "consolecheat-sfx", "version": 1, "sounds": [{ "id", "name", "created", "params" }] }`. It is created only when you save a sound. A value that does not parse, a foreign schema, or another version falls back to an empty library and does not crash. Single broken entries are skipped.
- `consolecheat-lang` and `consolecheat-theme` (localStorage, shared with the other consolecheat tools on robfreak.github.io)

The Datenschutz page names the key, says everything stays in the browser, cites Art. 6 Abs. 1 lit. f DSGVO for the host’s connection logs, and has a button that removes only `consolecheat-sfx-v1`. Nothing else is stored.

## Run and test

```bash
npm install
npm test        # node --experimental-strip-types --test src/sfx/*.test.ts
npm run dev     # http://127.0.0.1:5173/consolecheat-ex16/
npm run build   # typecheck, Vite build (base /consolecheat-ex16/), offline check of dist/
npm run preview # http://127.0.0.1:4173/consolecheat-ex16/
```

Node `>=22.6` (`package.json` `engines`).

## Files

- `index.html`: the HTML entry (Vite input)
- `src/sfx/`: React + TypeScript source, styles, and tests
  - `params.ts` (parameter model and validation), `prng.ts`, `presets.ts`, `synth.ts`, `wav.ts`, `history.ts`, `library.ts` (storage, import and export), `input.ts` (keyboard and gamepad mapping)
  - `Generator.tsx` (the tool), `App.tsx`, `chrome.tsx`, `legal.tsx`, `messages.ts` (DE/EN)
  - `tools.ts` and `tool-links.tsx`: the footer list **Weitere Werkzeuge** (keep it identical across the consolecheat repos)
- `public/`: `favicon.svg`, `FONT-OFL.txt`, `.nojekyll`
- `scripts/check-dist.mjs`: offline check of `dist/` (no third-party hosts, no `.woff` fallback, woff2 fonts present)
- `.github/workflows/pages.yml`: test, build, and deploy to `gh-pages`

## Other tools

The footer group **Weitere Werkzeuge** (English: **Other tools**) links to the other consolecheat tools: Title-ID-Finder (ex1), PS-Plus-Archiv (ex2), Controller-Tester (ex3), Save-Info-Leser (ex4), Fehlercode-Nachschlager (ex5), the [Spiele-Merkliste](https://robfreak.github.io/consolecheat-ex6/), [Bildschirm-Test](https://robfreak.github.io/consolecheat-ex7/), [Download-Zeit-Rechner](https://robfreak.github.io/consolecheat-ex8/), [Tastenbelegung](https://robfreak.github.io/consolecheat-ex9/), [HDR/Helligkeit](https://robfreak.github.io/consolecheat-ex10/), [Audio-Kanal-Test](https://robfreak.github.io/consolecheat-ex11/), [USB-Stick-Checkliste](https://robfreak.github.io/consolecheat-ex12/), [Combo-Trainer](https://robfreak.github.io/consolecheat-ex13/), [Sprite-Animator](https://robfreak.github.io/consolecheat-ex14/), and [Chiptune-Sequencer](https://robfreak.github.io/consolecheat-ex15/). These are ordinary links. The page does not request those sites.

## GitHub Pages

`.github/workflows/pages.yml` runs install, test, and build on pull requests and on every push. A push to `main` also pushes `dist/` to the orphan branch `gh-pages` (`peaceiris/actions-gh-pages`, Jekyll off). Vite `base` is `/consolecheat-ex16/`, which matches the project site <https://robfreak.github.io/consolecheat-ex16/>.

Enable once in the repository settings:

1. **Settings → Actions → General → Workflow permissions → Read and write permissions.** Save.
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.** Branch: **`gh-pages`**, folder: **`/ (root)`.** Save.

After that, every push to `main` updates the site.

## Credits

The synth follows the parameter model of sfxr by DrPetter. This is an independent TypeScript implementation. Outfit and Source Sans 3 are bundled from `@fontsource` under the SIL Open Font License; see `public/FONT-OFL.txt` and `THIRD_PARTY_NOTICES.md`.

Replace the Impressum placeholders with the operator’s real details before treating that page as a legal notice.
