// Puts a child's drawing into the game as a monster.
//
//   npm run add-creature -- tegning.jpg --navn "Pusling" --type ild [--ryg ryg.jpg] [--lyd lyd.m4a] [--vild 2]
//
// Takes a phone photo of a drawing on white paper (JPEG or PNG), cleans it up, traces it
// as vector shapes with a woodblock-style ink edge and Kanagawa-leaning colours, and
// writes into shared/content/creatures/:
//   <id>_front.png, <id>_back.png   the sprites (the back is the mirrored front, a bit
//                                   darker, unless --ryg gives a drawing of the back)
//   <id>.json                        the monster (only if it doesn't exist yet: an existing
//                                   one keeps its stats, only its pictures are replaced)
//   <id>.wav / .m4a / .mp3           its cry: --lyd (e.g. from the Diktafon app), or a stand-in
//   drawings/<id>.jpg, <id>.svg      the original photo (smaller) and the traced drawing
// and a preview next to the photo (<id>-forhåndsvisning.png) to check the result.
// --vild N also lets it turn up in the wild in Startskoven (N = how often, like 1–3).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DrawingError, drawingToSvg, render } from "./lib/drawing.mjs";
import { makeCry } from "./lib/cry.mjs";
import { encodeWav } from "./lib/wav.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CREATURES = path.join(ROOT, "shared/content/creatures");
const DRAWINGS = path.join(CREATURES, "drawings");
const MOVES = path.join(ROOT, "shared/content/moves.json");
const AREA_META = path.join(ROOT, "shared/content/areas/startskoven.meta.json");
const TYPES = ["ild", "vand", "graes", "lyn", "sten"];
/** Sprite size in pixels: 3× the game's 128 px, so it stays sharp on retina screens. */
const SPRITE = 384;

/** Stats that suit each type: fire hits hard, water lasts, grass is quick, lightning is quickest, stone defends. */
const STATS = {
  ild: { hp: 38, angreb: 14, forsvar: 9, fart: 11 },
  vand: { hp: 46, angreb: 11, forsvar: 11, fart: 9 },
  graes: { hp: 40, angreb: 11, forsvar: 10, fart: 13 },
  lyn: { hp: 36, angreb: 12, forsvar: 9, fart: 15 },
  sten: { hp: 46, angreb: 10, forsvar: 14, fart: 7 },
};

function usage(message) {
  if (message) console.error(`\n${message}\n`);
  console.error(`Sådan bruges den:
  npm run add-creature -- <foto> --navn "Navn" --type <${TYPES.join("|")}> [--ryg <foto af ryggen>] [--lyd <lydfil>] [--vild <1-5>] [--id <id>]

  <foto>   et billede af tegningen på hvidt papir (JPEG eller PNG)
  --navn   monsterets navn, som det skal stå i spillet
  --type   ${TYPES.join(", ")}
  --ryg    et billede af en tegning af monsteret bagfra (ellers bruges forsiden spejlvendt)
  --lyd    monsterets lyd (.m4a fra Diktafon, .wav eller .mp3); ellers laves en lille lyd
  --vild   lad det dukke op i naturen i Startskoven; tallet er hvor tit (fx 2)
  --id     filnavnet (laves ellers af navnet)`);
  process.exit(1);
}

function parseArgs(argv) {
  const out = { photo: undefined, navn: undefined, type: undefined, ryg: undefined, lyd: undefined, vild: undefined, id: undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      if (!(key in out) || key === "photo") usage(`Ukendt valg: ${a}`);
      out[key] = argv[++i];
      if (out[key] === undefined) usage(`${a} mangler en værdi`);
    } else if (!out.photo) out.photo = a;
    else usage(`Hvad er "${a}"?`);
  }
  return out;
}

/** "Æblegrød Junior" → "aeblegroed-junior": lowercase ASCII, æ/ø/å transliterated (see CLAUDE.md). */
function slug(navn) {
  return navn
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Two or three moves of its own type plus claws. */
function movesFor(type) {
  const moves = JSON.parse(readFileSync(MOVES, "utf-8"));
  const own = moves.filter((m) => m.type === type).sort((a, b) => a.power - b.power).map((m) => m.id);
  return [...own.slice(0, 2), "kloer", ...own.slice(2, 3)].slice(0, 3);
}

/** Adds the monster to Startskoven's encounter table, keeping the hand-written file's layout. */
function addToWild(id, weight) {
  const text = readFileSync(AREA_META, "utf-8");
  if (text.includes(`"speciesId": "${id}"`)) return false;
  const next = text.replace(/("encounterTable":\s*\[[\s\S]*?)(\n\s*\])/, (_, list, end) => `${list},\n    { "speciesId": "${id}", "weight": ${weight} }${end}`);
  writeFileSync(AREA_META, next);
  return true;
}

/** Original photo | the monster on dark and on light | its back — to check before playing. */
async function preview(photoFile, front, back, file) {
  const H = 420;
  const photo = await sharp(photoFile, { failOn: "none" }).rotate().resize({ height: H, width: 320, fit: "inside" }).toBuffer();
  const meta = await sharp(photo).metadata();
  const on = async (png, colour) => sharp({ create: { width: H, height: H, channels: 4, background: colour } }).composite([{ input: await sharp(png).resize(H - 20).toBuffer(), left: 10, top: 10 }]).png().toBuffer();
  const tiles = [photo, await on(front, "#1f1f28"), await on(front, "#dcd7ba"), await on(back, "#1f1f28")];
  const widths = [meta.width, H, H, H];
  let left = 10;
  const composite = tiles.map((input, i) => {
    const t = { input, left, top: 10 };
    left += widths[i] + 10;
    return t;
  });
  await sharp({ create: { width: left, height: H + 20, channels: 3, background: "#16161d" } }).composite(composite).png().toFile(file);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.photo) usage("Mangler billedet af tegningen.");
  if (!existsSync(args.photo)) usage(`Kan ikke finde ${args.photo}`);
  if (!args.navn) usage("Mangler --navn.");
  const type = args.type && slug(args.type);
  if (!TYPES.includes(type)) usage(`--type skal være én af: ${TYPES.join(", ")}`);
  const id = slug(args.id ?? args.navn);
  if (!id) usage("Navnet giver ikke et brugbart filnavn; brug --id.");
  const weight = args.vild === undefined ? undefined : Number(args.vild);
  if (weight !== undefined && !(weight > 0 && weight <= 10)) usage("--vild skal være et tal fra 1 til 10.");
  if (args.ryg && !existsSync(args.ryg)) usage(`Kan ikke finde ${args.ryg}`);
  if (args.lyd && !existsSync(args.lyd)) usage(`Kan ikke finde ${args.lyd}`);

  console.log(`Renser og tegner ${args.navn} op …`);
  const front = await drawingToSvg(args.photo);
  const frontPng = await render(front.svg, SPRITE);
  let backPng;
  let backSvg;
  if (args.ryg) {
    const back = await drawingToSvg(args.ryg);
    backSvg = back.svg;
    backPng = await render(back.svg, SPRITE);
  } else {
    backPng = await render(front.svg, SPRITE, { back: true });
  }

  mkdirSync(DRAWINGS, { recursive: true });
  writeFileSync(path.join(CREATURES, `${id}_front.png`), frontPng);
  writeFileSync(path.join(CREATURES, `${id}_back.png`), backPng);
  writeFileSync(path.join(DRAWINGS, `${id}.svg`), front.svg);
  if (backSvg) writeFileSync(path.join(DRAWINGS, `${id}-ryg.svg`), backSvg);
  // Keep the child's original drawing (smaller), e.g. to redo the sprite later.
  await sharp(args.photo, { failOn: "none" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(DRAWINGS, `${id}.jpg`));
  if (args.ryg) await sharp(args.ryg, { failOn: "none" }).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(DRAWINGS, `${id}-ryg.jpg`));

  // The cry: the child's own recording, or a stand-in until there is one.
  let sound;
  if (args.lyd) {
    const ext = path.extname(args.lyd).toLowerCase();
    if (![".m4a", ".wav", ".mp3"].includes(ext)) usage("--lyd skal være .m4a, .wav eller .mp3 (det iPad Safari kan spille).");
    sound = `creatures/${id}${ext}`;
    copyFileSync(args.lyd, path.join(CREATURES, `${id}${ext}`));
  }

  const jsonFile = path.join(CREATURES, `${id}.json`);
  if (existsSync(jsonFile)) {
    const existing = JSON.parse(readFileSync(jsonFile, "utf-8"));
    if (sound && existing.sound !== sound) {
      existing.sound = sound;
      writeFileSync(jsonFile, JSON.stringify(existing, null, 2) + "\n");
    }
    console.log(`${id}.json fandtes allerede: kun billederne${sound ? " og lyden" : ""} er skiftet.`);
  } else {
    if (!sound) {
      sound = `creatures/${id}.wav`;
      writeFileSync(path.join(CREATURES, `${id}.wav`), encodeWav(makeCry(id, type)));
    }
    const moveIds = movesFor(type);
    const creature = {
      id,
      navn: args.navn,
      type,
      baseStats: STATS[type],
      moveIds,
      spriteFront: `creatures/${id}_front.png`,
      spriteBack: `creatures/${id}_back.png`,
      sound,
      catchRate: 0.4,
    };
    // Same layout as the hand-written files.
    const text = JSON.stringify(creature, null, 2)
      .replace(/"baseStats": \{\s+"hp": (\d+),\s+"angreb": (\d+),\s+"forsvar": (\d+),\s+"fart": (\d+)\s+\}/, '"baseStats": { "hp": $1, "angreb": $2, "forsvar": $3, "fart": $4 }')
      .replace(/"moveIds": \[\s+([^\]]*?)\s+\]/, (_, list) => `"moveIds": [${list.split(/,\s+/).join(", ")}]`);
    writeFileSync(jsonFile, text + "\n");
    console.log(`Lavede ${id}.json (type ${type}, angreb: ${moveIds.join(", ")}). Ret tallene, hvis I vil.`);
  }
  if (weight !== undefined) console.log(addToWild(id, weight) ? `${args.navn} kan nu dukke op i Startskoven (vægt ${weight}).` : `${args.navn} var allerede i Startskoven.`);

  const previewFile = path.join(path.dirname(path.resolve(args.photo)), `${id}-forhåndsvisning.png`);
  await preview(args.photo, frontPng, backPng, previewFile);
  console.log(`Farver: ${front.palette.join(" ")}`);
  console.log(`\nFærdig! Se resultatet her: ${previewFile}`);
  console.log("Byg spillet igen (npm run build, eller genstart npm run dev), så er monsteret med.");
}

main().catch((error) => {
  if (error instanceof DrawingError) {
    console.error(`\n${error.message}`);
    process.exit(1);
  }
  throw error;
});
