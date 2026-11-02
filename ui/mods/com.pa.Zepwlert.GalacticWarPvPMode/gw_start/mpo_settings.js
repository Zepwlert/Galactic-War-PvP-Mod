// Galactic War PvP Mode settings: ranges, defaults, clamping. Pure; loaded as a plain script
// in the game (defines window.mpoSettings) and with require() in tests.
(function (root) {
  var LIMITS = {
    cardPicks: { min: 1, max: 20, def: 5 }, // times cards are shown, i.e. free explores before the battle
    cardsShown: { min: 1, max: 5, def: 3 }, // options per pick. No rerolls.
    battles: { min: 1, max: 20, def: 3 }, // fights with the finished loadout, each on a different system
  };
  var MODES = ["ffa", "team"];

  var clamp = function (value, limit) {
    var n = Math.round(Number(value));
    return isFinite(n) ? Math.max(limit.min, Math.min(limit.max, n)) : limit.def;
  };

  // Always returns a complete, in-range object, whatever it is given (old saves, typed junk).
  var sanitize = function (input) {
    input = input || {};
    var out = { pvp: input.pvp === true, debug: input.debug === true }; // debug: show the status box
    Object.keys(LIMITS).forEach(function (k) {
      out[k] = input[k] === undefined ? LIMITS[k].def : clamp(input[k], LIMITS[k]);
    });
    out.color = clamp(input.color === undefined ? 0 : input.color, { min: 0, max: 11, def: 0 }); // the host's colour: an index into mpoWar.PALETTE
    out.mode = MODES.indexOf(input.mode) !== -1 ? input.mode : "ffa";
    // What the mode forces off. Recorded so every later step reads the same flags.
    out.noAI = out.pvp;
    out.noGuardians = out.pvp;
    out.noSubCommanders = out.pvp;
    return out;
  };

  var api = { LIMITS: LIMITS, MODES: MODES, clamp: clamp, sanitize: sanitize, TAG: "mpo" };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.mpoSettings = api;
})(typeof window !== "undefined" ? window : this);
