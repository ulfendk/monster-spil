# Backlog

Ideas agreed on but not scheduled yet. Newest at the bottom.

- **Natural events.** Earthquakes, meteor strikes and dragon fire that alter the
  landscape (e.g. burn grass, open or block paths, leave craters) and can inflict
  damage on monsters. Open questions: shared for everyone on the server or per
  device; permanent or healing over time; how "damage" works outside battles.
- **Admin portal.** A small web page for a parent to manage the family game: see
  and remove players, reset or adjust the scoreboard and the dragon, manage maps and
  monsters, and change settings like the family code. Could be served by the game
  server itself (it already has an HTTP endpoint for `/health`), behind its own
  admin password or the family code. Open questions: which actions are needed
  first; whether content (maps, monsters) should be editable there or stay as files
  in the repo; how it authenticates.
- **Multiple game groups.** A child can play in more than one group — with the
  family, with classmates, etc. — each its own separate game (players, scoreboard,
  dragon). Open questions: one server hosting several groups (each with its own
  code) or one server per group; whether a child's monsters and progress are shared
  across groups or kept separate per group (today each device has exactly one save);
  who creates groups and hands out codes (ties in with the admin portal).
- **Shorter pass-out after wild battles.** Losing a wild battle should only make you
  pass out for 30 seconds (today it is 30–60 s depending on how close the fight was,
  like duels and the dragon). Duels and the dragon keep the 30–60 s range unless
  decided otherwise.
