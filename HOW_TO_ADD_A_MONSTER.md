# Sådan laver du dit eget monster!

Vil du have dit eget monster i spillet? Sådan gør du!

## Trin 1: Tegn dit monster

Tegn dit monster på et stykke papir.

Tips:
- Brug tydelige streger.
- Tegn helst på hvidt papir.

## Trin 2: Find på navn og type

Giv dit monster et navn.

Vælg én type:

🔥 Ild · 💧 Vand · 🌿 Græs · ⚡ Lyn · 🪨 Sten

Find også på 2 til 4 angreb, som dit monster kan bruge i kamp.

Hvilken lyd siger dit monster? 🔊 Optag den på iPad'en med appen Diktafon. Du kan
bruge din stemme eller noget, der larmer. Den må gerne være kort — 1 til 2 sekunder.

## Trin 3: Spørg en voksen

Bed en voksen om at sætte dit monster ind i spillet.

**Til den voksne:** Tag et billede af tegningen med telefonen (lige ovenfra, i godt
lys, hele papiret med). Læg billedet — og lyden, hvis der er en — over på computeren
og kør:

```
npm run add-creature -- tegning.jpg --navn "Pusling" --type ild --lyd lyd.m4a --vild 2
```

- `--navn` er monsterets navn, og `--type` er én af `ild`, `vand`, `graes`, `lyn`
  eller `sten`.
- `--lyd` er lyden fra Diktafon (.m4a, .wav eller .mp3). Uden den laver spillet en
  lille lyd, der passer til typen.
- `--vild 2` gør, at monsteret kan dukke op i naturen (tallet er hvor tit, fx 1–3).
  Uden det findes monsteret kun i Monsterbogen og ved bytte.
- Har barnet også tegnet monsteret bagfra, så tilføj `--ryg ryg.jpg`. Ellers bruges
  forsiden spejlvendt.

Scriptet renser papiret, finder tegningen, tegner den op med en tyk tuschkant og
farver, der passer til spillet, og laver monsterets fil. Det gemmer også
en forhåndsvisning ved siden af billedet (`pusling-forhåndsvisning.png`) — se den,
før I spiller. Er I ikke tilfredse, så tag et nyt billede og kør det igen: billederne
bliver skiftet ud, men monsterets tal bliver, som de er.

iPhone-billeder i HEIC-format skal laves om til JPEG først (eller sæt kameraet til
»Mest kompatibel« under Indstillinger → Kamera → Formater).

Tallene står i `shared/content/creatures/pusling.json` og kan rettes bagefter:

- `hp`, `angreb`, `forsvar` og `fart` — prøv omkring 30-50 for `hp` og 8-15 for de
  andre. Jo højere tal, jo bedre er monsteret til den ting.
- `moveIds` er monsterets 2 til 4 angreb (se `shared/content/moves.json`).

## Trin 4: Find dit monster i spillet!

Genstart spillet, og gå ud i naturen — så kan dit monster dukke op!
