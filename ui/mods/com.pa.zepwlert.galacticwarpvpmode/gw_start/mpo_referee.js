// Turns a launch config into a PvP battle: every human army hostile to the others, the AI armies idle.
// Pure. config.armies is the list GW's referees build (AI armies have a slot with ai: true).
(function (root) {
  var isHuman = function (army) {
    return !!army && Array.isArray(army.slots) && !army.slots.some(function (s) { return s && s.ai; });
  };

  // settings.mode "ffa": every human is their own alliance (1, 2, 3 ...: small numbers, since the engine may use them as indexes). "team": two teams, alternating in
  // army order, so the host and the second player are opponents and a third joins the host.
  // Returns { ok, humans, reason }. On !ok the config is left unchanged.
  // aiMode says what happens to the AI armies of the ordinary battle. The battle server crashes when no AI
  // army is left at all, so exactly one stays (the first):
  //   "idle" (default): it has no income (the caller also strips its commander of orders, see mpo_play.js)
  //   "active":         it plays as it is, as a side of its own
  //   "remove":         all AI armies are dropped (kept for the tests; crashes the real server)
  var toPvp = function (config, settings, aiMode) {
    aiMode = aiMode || "idle";
    var armies = (config && config.armies) || [];
    var humans = armies.filter(isHuman);
    if (humans.length < 2) return { ok: false, humans: humans.length, reason: "PVP needs at least two human players" };
    humans.forEach(function (army, i) {
      army.alliance_group = settings.mode === "team" ? 1 + (i % 2) : 1 + i;
    });
    var ais = armies.filter(function (a) { return !isHuman(a); });
    var kept = aiMode === "remove" ? [] : ais.slice(0, 1);
    kept.forEach(function (army) {
      army.alliance_group = humans.length + 1;
      if (aiMode === "idle") army.econ_rate = 0;
    });
    config.armies = humans.concat(kept);
    config.mpo_pvp = true;
    return { ok: true, humans: humans.length, ai: kept.length, dropped: ais.length - kept.length, idle: aiMode === "idle" ? kept : [] };
  };

  var api = { isHuman: isHuman, toPvp: toPvp };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.mpoReferee = api;
})(typeof window !== "undefined" ? window : this);
