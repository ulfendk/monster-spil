# Backlog

Ideas agreed on but not scheduled yet. Newest at the bottom.

- **Natural events.** Earthquakes, meteor strikes and dragon fire that alter the
  landscape (e.g. burn grass, open or block paths, leave craters) and can inflict
  damage on monsters. Open questions: shared for everyone on the server or per
  device; permanent or healing over time; how "damage" works outside battles.
- **Teaming up against the dragon.** Several players who stand by the lair can
  fight the dragon together in one battle. The group's HP gets a bonus factor that
  grows with the group's size (the more players, the higher the factor). Open
  questions: the exact factor per group size; whether each player picks a move per
  turn (like a duel) or the group shares one turn; how damage and the final blow
  are credited on the scoreboard.
- **Admin portal.** A small web page for a parent to manage the family game: see
  and remove players, reset or adjust the scoreboard and the dragon, manage maps and
  monsters, and change settings like the family code. Could be served by the game
  server itself (it already has an HTTP endpoint for `/health`), behind its own
  admin password or the family code. Open questions: which actions are needed
  first; whether content (maps, monsters) should be editable there or stay as files
  in the repo; how it authenticates.
