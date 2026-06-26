#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPaddedIconWebp } from "./lib/iconWebpPadding.mjs";
import { slugToCategoryWebpPath } from "./lib/iconAssetPaths.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS_ROOT = path.join(ROOT, "public", "assets");
const ICON_RESOURCE_BY_SLUG = {
  rabid: "InfusionSkillIcon_792020200",
  "party-rocker": "InfusionSkillIcon_792150200",
  "suspicious-experiment": "InfusionSkillIcon_792180200",
};
async function downloadIconPng(iconResource) {
  const candidates = [
    `https://playeternalreturn.com/resources/${iconResource}.png`,
    `https://playeternalreturn.com/resources/Trait/${iconResource}.png`,
    `https://cdn.playeternalreturn.com/resources/${iconResource}.png`,
  ]
  for (const url of candidates) {
    const res = await fetch(url, {
      headers: {
        accept: 'image/*',
        'user-agent': 'Mozilla/5.0',
        referer: 'https://playeternalreturn.com/',
      },
    })
    if (!res.ok) continue
    const contentType = String(res.headers.get('content-type') || '')
    if (!contentType.includes('image')) continue
    return Buffer.from(await res.arrayBuffer())
  }
  return null
}

async function main() {
  const force = process.env.FORCE === '1' || process.env.FORCE === 'true'
  let imported = 0
  let skipped = 0
  let failed = 0

  for (const [slug, iconResource] of Object.entries(ICON_RESOURCE_BY_SLUG)) {
    const outputPath = slugToCategoryWebpPath(ASSETS_ROOT, "loadout", "infusion-cobalt-protocol/" + slug);
    if (!force) {
      try { await fs.access(outputPath); console.log("skip", slug); skipped += 1; continue; } catch {}
    }

    const buf = await downloadIconPng(iconResource)
    if (!buf) {
      console.warn("warn: no CDN image for", slug, iconResource)
      failed += 1
      continue
    }

    const tmp = path.join(ROOT, ".cache", "cobalt-infusion-icons", iconResource + ".png");
    await fs.mkdir(path.dirname(tmp), { recursive: true });
    await fs.writeFile(tmp, buf);
    await createPaddedIconWebp(tmp, outputPath);
    console.log("imported", slug);
    imported += 1
  }

  console.log(`CDN cobalt icons: ${imported} imported, ${skipped} skipped, ${failed} unavailable`)
  if (failed > 0) process.exitCode = 0
}
main().catch((e) => { console.error(e); process.exit(1); });
