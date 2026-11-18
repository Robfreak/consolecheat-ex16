import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

// JSX drops whitespace that contains a line break, so "im \n<span>" renders as "im<span>".
// A space that must survive a line break has to be written as {" "}.

const here = fileURLToPath(new URL(".", import.meta.url));

test("no .tsx file has a trailing space before a JSX line break", () => {
  const files = readdirSync(here).filter((name) => name.endsWith(".tsx"));
  assert.ok(files.includes("legal.tsx"));
  for (const name of files) {
    const lines = readFileSync(join(here, name), "utf8").split("\n");
    lines.forEach((line, i) => {
      assert.doesNotMatch(line, /\S[ \t]+$/, `${name}:${i + 1} ends with a space that JSX drops; use {" "}`);
    });
  }
});

test("Impressum and Datenschutz render with spaces between words and code names, in DE and EN", async () => {
  const dir = mkdtempSync(join(fileURLToPath(new URL("../../node_modules/", import.meta.url)), "sfx-legal-"));
  const outfile = join(dir, "render.mjs");
  try {
    await esbuild.build({
      stdin: {
        contents: `
          import { createElement } from "react";
          import { renderToStaticMarkup } from "react-dom/server";
          import { LegalPage } from "./legal.tsx";
          import { copy } from "./messages.ts";
          export function render(page, lang) {
            return renderToStaticMarkup(createElement(LegalPage, {
              page, homeHref: "/", onHome() {}, text: copy[lang], onDeleteAll: () => true,
            }));
          }
        `,
        resolveDir: here,
        sourcefile: "sfx-legal-render.tsx",
        loader: "tsx",
      },
      bundle: true,
      packages: "external",
      format: "esm",
      platform: "node",
      outfile,
      jsx: "automatic",
      logLevel: "silent",
    });
    const { render } = (await import(pathToFileURL(outfile).href)) as {
      render: (page: "impressum" | "datenschutz", lang: "de" | "en") => string;
    };
    const plain = (html: string) =>
      html
        // Inline tags join their text directly, block tags start a new line.
        .replace(/<\/?(?:span|a|strong|em|code|b|i)(?:\s[^>]*)?>/g, "")
        .replace(/<[^>]+>/g, "\n")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .replace(/&#x27;/g, "'");
    for (const lang of ["de", "en"] as const) {
      for (const page of ["impressum", "datenschutz"] as const) {
        const text = plain(render(page, lang));
        // A letter glued to a code name or link text means a lost space.
        const names = "localStorage|sessionStorage|consolecheat-sfx-v1|consolecheat-lang|consolecheat-theme";
        assert.doesNotMatch(text, new RegExp(`[\\p{L}.,:;)](?:${names})`, "u"), `${lang} ${page}: text glued before a key`);
        assert.doesNotMatch(text, new RegExp(`(?:${names})\\p{L}`, "u"), `${lang} ${page}: text glued after a key`);
        assert.doesNotMatch(text, /[a-zäöüß][.,]?(Datenschutzerklärung|GitHub Privacy)/u, `${lang} ${page}`);
      }
      const privacy = plain(render("datenschutz", lang));
      assert.match(privacy, / im localStorage unter consolecheat-sfx-v1/);
      assert.match(privacy, /nur den Schlüssel consolecheat-sfx-v1/);
      assert.match(privacy, /consolecheat-lang und consolecheat-theme/);
      assert.match(privacy, /uses the localStorage key consolecheat-sfx-v1/);
      assert.match(privacy, /consolecheat-lang and consolecheat-theme/);
      assert.match(privacy, /Protokolle nicht\. Datenschutzerklärung von GitHub/);
      assert.match(privacy, /receive those logs\. GitHub Privacy Statement/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
