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

Find også på 2-4 angreb, som dit monster kan bruge i kamp.

## Trin 3: Spørg en voksen

Bed en voksen om at lægge din monster-fil ind i spillet.

Her er et eksempel, som den voksne kan bruge som skabelon:

```json
{
  "id": "dit-monsters-navn",
  "navn": "Dit Monsters Navn",
  "type": "ild",
  "baseStats": { "hp": 40, "angreb": 12, "forsvar": 10, "fart": 10 },
  "moveIds": ["gloedslag", "kloer"],
  "spriteFront": "creatures/dit-monsters-navn_front.png",
  "spriteBack": "creatures/dit-monsters-navn_back.png",
  "catchRate": 0.5
}
```

- `navn` er navnet på dit monster.
- `type` er én af de fem typer ovenfor (skriv `ild`, `vand`, `graes`, `lyn` eller `sten`).
- `hp`, `angreb`, `forsvar` og `fart` er tal — prøv omkring 30-50 for `hp` og
  8-15 for de andre. Høje tal gør monsteret bedre til den ting.

## Trin 4: Find dit monster i spillet!

Genstart spillet, og gå ud i naturen — så kan dit monster dukke op!

---

*Lige nu tegner en voksen dit monster som simple former i spillet, fordi vi endnu
ikke kan tage et billede af din tegning. Det kommer senere!*
