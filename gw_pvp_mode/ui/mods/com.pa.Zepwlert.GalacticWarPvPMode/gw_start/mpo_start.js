// Applies the war transform when the start scene saves a new war with PVP Skirmish on. Wraps
// GW.manifest.saveGame, the one call GWO's generation and the stock scene both end in, so the
// galaxy is already built and populated when we get it. On any error the war is saved unchanged.
// Every step is also written to localStorage ("mpo_diag") because the start screen is gone by the
// time the war opens; the status box in the war reads it back.
(function () {
  var diag = function (key, value) {
    try {
      var d = JSON.parse(localStorage.getItem("mpo_diag") || "{}");
      d[key] = value;
      localStorage.setItem("mpo_diag", JSON.stringify(d));
    } catch (e) {}
  };
  var text = function (e) { return String((e && (e.stack || e.message)) || e).slice(0, 400); };
  try {
    diag("start script", new Date().toISOString());
    diag("saves seen", 0);
    diag("error", "");
    requireGW(["shared/gw_common", "shared/gw_star"], function (GW, Star) {
      diag("hook installed", true);
      var save = GW.manifest.saveGame;
      GW.manifest.saveGame = function (game) {
        try {
          diag("saves seen", (JSON.parse(localStorage.getItem("mpo_diag") || "{}")["saves seen"] || 0) + 1);
          var cfg = model.mpo && model.mpo.value();
          var tag = game && game.inventory().getTag("global", "mpo");
          diag("panel settings", cfg ? (cfg.pvp ? "pvp on" : "pvp off") : "missing");
          diag("tag has plan", !!(tag && tag.plan));
          if (cfg && cfg.pvp && game && !(tag || {}).plan) {
            var plan = window.mpoWar.apply(game, cfg, { Star: Star });
            diag("transformed", JSON.stringify(plan).slice(0, 200));
            console.log("[Galactic War PvP Mode] war transformed", JSON.stringify(plan));
          }
        } catch (e) {
          diag("error", text(e));
          console.error("[Galactic War PvP Mode] could not apply PVP Skirmish; saving the war unchanged:", e);
        }
        return save.apply(this, arguments);
      };
    }, function (err) {
      diag("error", "modules not loaded: " + text(err));
    });
  } catch (e) {
    diag("error", "start hook failed: " + text(e));
  }
})();
