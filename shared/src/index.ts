export type { TypeId, StatBlock, CreatureSpecies, CreatureInstance } from "./types/creature.js";
export type { Move } from "./types/move.js";
export { TYPE_ADVANTAGE, getMultiplier } from "./types/type-chart.js";
export type { EncounterTableEntry, EncounterRegion, AreaMeta, AreaLink, AreaLook3d, LinkKind } from "./types/area.js";
export type { BattleMode, BattleParticipant, BattleState, BattleAction, BattleLogEntry, ItemEffect } from "./types/battle.js";
export { indexCreatures, indexMoves, validateContent } from "./content/content-loader.js";
export type { Rng } from "./battle/rng.js";
export { createRng } from "./battle/rng.js";
export { attemptCatch } from "./battle/catch.js";
export { createBattle, resolveTurn, outcomeFor } from "./battle/engine.js";
export {
  createTrade,
  acceptInvite,
  setOffer,
  confirmTrade,
  cancelTrade,
  deliveriesFor,
  involves,
  otherPlayerId,
} from "./trade/trade-session.js";
export type { TradePhase, TradeSide, TradeSession, TradeResult, TradeDelivery } from "./trade/trade-session.js";
export { applyDelivery } from "./trade/apply-trade.js";
export { LOBBY_ROOM, GAME_KEY_REJECTED, PLAYER_ELSEWHERE, PROTOCOL_VERSION } from "./trade/protocol.js";
export type { LobbyPlayer, LobbyJoinOptions, MountView, ClientMessages, ServerMessages, RewardDelivery, DisasterMessage, DisasterNews } from "./trade/protocol.js";
export {
  createDuel,
  acceptDuel,
  submitAction,
  timeoutTurn,
  forfeitDuel,
  cancelDuel,
  duelView,
  duelInvolves,
  duelOpponentOf,
  MAX_MISSED_TURNS,
} from "./duel/duel-session.js";
export type { DuelPhase, DuelAction, DuelSession, DuelView, DuelResult } from "./duel/duel-session.js";
export { sanitizeSeat } from "./duel/sanitize.js";
export { isAdjacent } from "./world/adjacency.js";
export type { WorldPosition } from "./world/adjacency.js";
export { arrowFor, nearestSpot, paintedTiles } from "./world/hint.js";
export type { SpotHint, Tile } from "./world/hint.js";
export { encounterTableAt, livesAt, livesInArea, regionAt } from "./world/regions.js";
export {
  BOSS_PLAYER_ID,
  bossParticipant,
  bossSpecies,
  contributors,
  currentRaid,
  freshRaid,
  raidTurn,
  raidView,
  startAttempt,
  weekIdFor,
} from "./raid/raid.js";
export type { BossDefinition, FightBoss, FightState, RaidState, RaidView, RaidTurnResult } from "./raid/raid.js";
export { SCORE_POINTS, SCOREBOARD_DAYS, inWindow, scoreboard } from "./score/scoreboard.js";
export type { ScoreEvent, ScoreKind, ScorePlayer, ScoreRow } from "./score/scoreboard.js";
export { DIAGONAL_TIME_FACTOR, chooseStep, dragDirection, groundSpeed, isMapEdge } from "./world/steps.js";
export type { Step } from "./world/steps.js";
export {
  MAX_TEAM,
  TEAM_MAX_MISSED,
  createTeam,
  joinTeam,
  leaveTeam,
  startTeam,
  submitTeamAction,
  teamHpFactor,
  teamInvolves,
  teamViewFor,
  timeoutTeamTurn,
} from "./raid/team.js";
export type { TeamMember, TeamMemberView, TeamPhase, TeamResult, TeamSession, TeamTurnResult, TeamView } from "./raid/team.js";
export {
  BAG_MAX,
  DISASTER_PASS_OUT_S,
  FOOD_KINDS,
  FOOD_SECONDS,
  PASS_OUT_MAX_S,
  PASS_OUT_MIN_S,
  WILD_PASS_OUT_MAX_S,
  WILD_PASS_OUT_MIN_S,
  closenessFromFoe,
  eatFood,
  passOutSeconds,
  passOutUntil,
  pickFoodKind,
  pickFoodSpot,
  secondsLeft,
} from "./recovery/recovery.js";
export type { FoodItem, FoodKind, PassOutKind } from "./recovery/recovery.js";
export {
  blocks,
  emptyTerrain,
  fromKey,
  healAllNow,
  healTerrain,
  inside,
  setTile,
  staysConnected,
  tileKey,
  tileNow,
  walkableNow,
  zoneAt,
} from "./world/terrain.js";
export type { AreaTerrain, BaseArea, EventZone, TerrainTileIds, TileOverride, TileState, WorldSpawn } from "./world/terrain.js";
export {
  DEFAULT_DISASTER_SETTINGS,
  DISASTER_KINDS,
  MAX_DISASTER_GAP_MINUTES,
  MIN_DISASTER_GAP_MINUTES,
  applyDisaster,
  cleanDisasterSettings,
  nextDisasterAt,
  pickDisasterKind,
  planDisaster,
  possibleKinds,
} from "./world/disasters.js";
export type { DisasterConfig, DisasterConfigs, DisasterKind, DisasterPlan, DisasterSettings, PlanOptions, TileChange } from "./world/disasters.js";
export {
  DEFAULT_ROAM_SETTINGS,
  MAX_ROAM_GAP_MINUTES,
  MIN_ROAM_GAP_MINUTES,
  chooseLair,
  cleanRoamSettings,
  nextRoamAt,
} from "./raid/roam.js";
export type { LairOptions, RoamSettings } from "./raid/roam.js";
export {
  beastDue,
  beastView,
  chooseBeastSpot,
  cleanBeastSettings,
  DEFAULT_BEAST_SETTINGS,
  freshBeast,
  habitatTile,
  HABITATS,
  MAX_BEAST_GAP_MINUTES,
  MAX_BEAST_STAY_MINUTES,
  MIN_BEAST_GAP_MINUTES,
  MIN_BEAST_STAY_MINUTES,
  nextBeastAt,
} from "./raid/beasts.js";
export type { BeastDefinition, BeastSettings, BeastSpotOptions, BeastState, BeastView, Habitat } from "./raid/beasts.js";
export {
  caveDue,
  caveKind,
  caveMouthTile,
  caveRocks,
  caveSpeciesIds,
  chooseCaveSpot,
  cleanCaveSettings,
  DEFAULT_CAVE_SETTINGS,
  freshCave,
  MAX_CAVE_GAP_MINUTES,
  MAX_CAVE_OPEN_MINUTES,
  MIN_CAVE_GAP_MINUTES,
  MIN_CAVE_OPEN_MINUTES,
  nextCaveAt,
  pickCaveKind,
  planCaveVisit,
  ROCK_AREA,
} from "./cave/caves.js";
export type { CaveConfig, CaveDecor, CaveKind, CaveLook, CaveParticles, CaveSettings, CaveSpotOptions, CaveState, CaveView, CaveVisit } from "./cave/caves.js";
export { BALL_START, ballAt, caveCatchChance, closestApproach, GRAVITY, HIT_RADIUS, hitPrecision, landingTime, aimToThrow } from "./cave/throw.js";
export type { Vec3 } from "./cave/throw.js";
export {
  award,
  boostStats,
  earnedBadges,
  emptyProgress,
  levelForXp,
  levelProgress,
  lookFor,
  monsterBonus,
  progressFromHistory,
  titleFor,
  xpForLevel,
} from "./player/progress.js";
export type { AwardResult, Badge, LevelConfig, Progress, ProgressEvent } from "./player/progress.js";
export { applyCut, applyDig, canCut, canDig, pickDigMonster, pickDigReward } from "./world/work.js";
export type { DigReward, MinigameConfig, WorkKind } from "./world/work.js";
export { isVariantId, rollVariant, variantById, variantName } from "./creature/variants.js";
export type { VariantConfig, VariantDef, VariantLook } from "./creature/variants.js";
export { SCENE_DECOR, SCENE_PARTICLES, sceneAt } from "./world/scenes.js";
export type { SceneConfig, SceneDecor, SceneKind, SceneLook, SceneParticles } from "./world/scenes.js";
export { canEnterWorld, linkAt, linkTarget, worldById } from "./world/worlds.js";
export type { WorldConfig, WorldDef } from "./world/worlds.js";
export { carryItem, dropSpots, eggSpot, healFromHeart, itemDay, itemSpots, winHealCount } from "./world/items.js";
export type { ItemConfig, ItemDef, ItemSpot } from "./world/items.js";
export { eggProgress, nestHasRoom, newEgg, walkEggs } from "./creature/eggs.js";
export type { Egg, EggConfig } from "./creature/eggs.js";
export { bondForNext, bondFromWin, canEvolve, care, evolve, stageCount, stageName, stageOf, stageStats } from "./creature/evolution.js";
export type { CareKind, NurtureConfig } from "./creature/evolution.js";
export { hasKey, questSpots, questState } from "./world/castles.js";
export type { CastleConfig, CastleDef, CastleProgress, QuestSpot } from "./world/castles.js";
export { RIDE_GAITS, RIDE_STEP_TIME, rideGait } from "./creature/riding.js";
export type { RideGait } from "./creature/riding.js";
