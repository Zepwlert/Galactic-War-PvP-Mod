// The Galactic War PvP Mode war transform. Pure logic over GW's own game objects (galaxy, stars,
// inventory), so it runs in the start scene and in tests. Loaded as a plain script (window.mpoWar).
//
// GW's rules we lean on: a star with an AI is a fight, a star without one with cards is an
// explore, and the war is won when no star has an AI. So the mode is a transform of a finished
// galaxy: every AI is removed except one placeholder on each battle system. The war then ends
// after the last of those is fought, which is the "amount of battles" setting.
(function (root) {
  var TAG = "mpo";

  var rngFor = function (seed) {
    var h = 2166136261, s = String(seed);
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    var a = h >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  var planetCount = function (star) {
    var system = star.system && star.system();
    return system && system.planets ? system.planets.length : 1;
  };

  // Picks `count` distinct stars, alternating between single-planet and multi-planet systems
  // so a run sees both, in a random order. Falls back to whichever kind is left.
  var pickBattleStars = function (stars, candidates, count, rnd) {
    var singles = [], multis = [];
    candidates.forEach(function (i) { (planetCount(stars[i]) > 1 ? multis : singles).push(i); });
    var take = function (list) { return list.splice(Math.floor(rnd() * list.length), 1)[0]; };
    var wantMulti = rnd() < 0.5;
    var out = [];
    while (out.length < count && (singles.length || multis.length)) {
      var list = wantMulti ? multis : singles;
      if (!list.length) list = wantMulti ? singles : multis;
      out.push(take(list));
      wantMulti = !wantMulti;
    }
    return out;
  };

  var shuffle = function (list, rnd) {
    for (var i = list.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = list[i]; list[i] = list[j]; list[j] = t;
    }
    return list;
  };

  var cloneStar = function (src, Star) {
    var s = new (Star || src.constructor)();
    s.load(JSON.parse(JSON.stringify(src.save())));
    return s;
  };

  // The smallest stock galaxy size that holds the line, so generation does no more work than it must.
  var sizeIndexFor = function (settings, numberOfSystems) {
    var need = settings.cardPicks + settings.battles + 1;
    for (var i = 0; i < numberOfSystems.length; i++) if (numberOfSystems[i] >= need) return i;
    return numberOfSystems.length - 1;
  };

  // Turns a finished galaxy into one path of systems that winds through it from the start:
  //   start system, then one system per card pick, then the battle systems (so the first battle
  //   is reached after the last pick). Galaxy size is ignored: the path is as long as picks + battles.
  // Every system keeps the position GW generated for it, so the whole path stays inside the map's
  // own bounds (stars placed beyond them shrink and fade in the map's perspective).
  // Returns the plan, or throws and leaves the game untouched.
  var apply = function (game, settings, deps) {
    if (!settings || !settings.pvp) return null;
    var Star = deps && deps.Star;
    var galaxy = game.galaxy();
    var stars = galaxy.stars().slice();
    var origin = galaxy.origin();
    if (stars.length < 2) throw new Error("galaxy too small");

    // A real AI object to stand in at each battle system, so everything that reads star.ai() keeps working.
    var pick = null;
    stars.forEach(function (s) {
      var ai = s.ai && s.ai();
      if (ai && !pick) pick = ai;
      if (ai && !ai.boss && !ai.treasurePlanet && (!pick || pick.boss || pick.treasurePlanet)) pick = ai;
    });
    if (!pick) throw new Error("no AI template found in the galaxy");
    var template = JSON.parse(JSON.stringify(pick));
    template.boss = false; // a boss win would end the whole war at once (GW defeatTeam)
    delete template.treasurePlanet; // no Guardians
    template.mpoBattle = true;

    var rnd = rngFor(game.id + ":" + (game.name ? game.name() : ""));
    var pool = [];
    stars.forEach(function (s, i) { if (i !== origin) pool.push(i); });

    var battleIdx = pickBattleStars(stars, pool, Math.min(settings.battles, pool.length), rnd);
    var rest = shuffle(pool.filter(function (i) { return battleIdx.indexOf(i) === -1; }), rnd);
    var battleStars = battleIdx.map(function (i) { return stars[i]; });
    var exploreStars = rest.slice(0, settings.cardPicks).map(function (i) { return stars[i]; });

    // Only if a very large request outgrows the galaxy: reuse systems rather than shorten the line.
    var donors = stars.filter(function (s, i) { return i !== origin; });
    while (battleStars.length < settings.battles) battleStars.push(cloneStar(donors[Math.floor(rnd() * donors.length)], Star));
    while (exploreStars.length < settings.cardPicks) exploreStars.push(cloneStar(donors[Math.floor(rnd() * donors.length)], Star));

    // A cloned system would sit exactly on its original: nudge it aside, still within the bounds.
    exploreStars.concat(battleStars).forEach(function (s) {
      if (stars.indexOf(s) !== -1) return;
      var c = s.coordinates(), clamp = function (v) { return Math.max(-0.95, Math.min(0.95, v)); };
      s.coordinates([clamp(c[0] + (rnd() - 0.5) * 0.2), clamp(c[1] + (rnd() - 0.5) * 0.2), c[2]]);
    });

    // Walk to the nearest system not yet on the path, so each step is a short hop across the map.
    var dist2 = function (a, b) {
      var p = a.coordinates(), q = b.coordinates();
      return (p[0] - q[0]) * (p[0] - q[0]) + (p[1] - q[1]) * (p[1] - q[1]);
    };
    var chain = function (from, list) {
      var left = list.slice(), out = [], at = from;
      while (left.length) {
        var best = 0;
        for (var k = 1; k < left.length; k++) if (dist2(at, left[k]) < dist2(at, left[best])) best = k;
        at = left.splice(best, 1)[0];
        out.push(at);
      }
      return out;
    };
    var orderedExplore = chain(stars[origin], exploreStars);
    var orderedBattle = chain(orderedExplore.length ? orderedExplore[orderedExplore.length - 1] : stars[origin], battleStars);
    var line = [stars[origin]].concat(orderedExplore, orderedBattle);
    var P = orderedExplore.length;
    var battleIndexes = [];
    line.forEach(function (s, i) {
      s.distance(i);
      s.ai(undefined);
      if (i === 0) {
        s.explored(true);
      } else {
        s.history([]);
        if (i > P) {
          battleIndexes.push(i);
          s.ai(JSON.parse(JSON.stringify(template)));
          s.cardList([]);
          s.explored(true); // shown on the map, and not an explore target
        } else {
          s.explored(false);
        }
      }
    });
    galaxy.stars(line);
    galaxy.gates(line.slice(1).map(function (s, i) { return [i, i + 1]; }));
    galaxy.origin(0);
    game.currentStar(0);

    // GWO's war record sits on the start system; its treasure (Guardian) star index no longer exists.
    var record = line[0].system && line[0].system() && line[0].system().gwaio;
    if (record && typeof record === "object") record.treasureStar = -1;

    // Per-player tech is what gives every human their own army and cards.
    if (game.perPlayerTechCards) game.perPlayerTechCards(true);
    if (game.sharedByDefault) game.sharedByDefault(false);

    var plan = {
      line: true,
      battleStars: battleIndexes,
      battlePlanets: battleIndexes.map(function (i) { return planetCount(line[i]); }),
      cardPicks: P,
      requestedCardPicks: settings.cardPicks,
      requestedBattles: settings.battles,
    };
    // (No Object.assign: the game's browser engine does not have it.)
    var stamped = {};
    Object.keys(settings).forEach(function (k) { stamped[k] = settings[k]; });
    stamped.plan = plan;
    game.inventory().setTag("global", TAG, stamped);
    // The same settings on the start system, which every player has: under per-player tech a viewer's
    // game inventory is their own, not the host's, so the host's tag alone would not reach them.
    var originSystem = line[0].system && line[0].system();
    if (originSystem && typeof originSystem === "object") originSystem[TAG] = JSON.parse(JSON.stringify(stamped));
    // Every player's saved inventory too, so a deal rebuilt from a record sees the same settings.
    var records = game.coopPlayerInventoryData ? game.coopPlayerInventoryData() : [];
    records.forEach(function (rec) {
      var inv = rec && rec.inventory;
      if (!inv) return;
      inv.tags = inv.tags || {};
      inv.tags.global = inv.tags.global || {};
      inv.tags.global[TAG] = JSON.parse(JSON.stringify(stamped));
    });
    if (records.length && game.coopPlayerInventoryData.valueHasMutated) game.coopPlayerInventoryData.valueHasMutated();
    return plan;
  };

  // The settings in force for an inventory: the saved war's, or, while the start screen is
  // still building the war, the host panel's. Null when PVP Skirmish is off.
  var settingsFor = function (inventory) {
    var v = inventory && inventory.getTag && inventory.getTag("global", TAG);
    if (v && v.pvp) return v;
    return active();
  };

  // The settings in force with no inventory to ask: the host panel while a war is being built,
  // or the war being played. Per-player card deals run on inventories rebuilt from each player's
  // saved record, which need not carry the war's tag, so everything that deals falls back to this.
  var active = function () {
    // Set by the co-op loadout scene, which has no game of its own to ask.
    if (api.sceneSettings) return api.sceneSettings;
    var w = typeof window !== "undefined" ? window : null;
    if (!w || !w.model) return null;
    if (w.model.mpo && w.model.mpo.pvp && w.model.mpo.pvp()) return w.model.mpo.value();
    try {
      var game = w.model.game && w.model.game();
      return game ? readGame(game) : null;
    } catch (e) {}
    return null;
  };

  // The war's settings from a game: the inventory tag (the host's), else the start system's marker
  // (what a viewer's copy of the war carries). Null for an ordinary war.
  var readGame = function (game) {
    try {
      var v = game.inventory().getTag("global", TAG);
      if (!(v && v.pvp && v.plan)) {
        var galaxy = game.galaxy(), star = galaxy.stars()[galaxy.origin()];
        v = star && star.system() && star.system()[TAG];
      }
      return v && v.pvp && v.plan ? v : null;
    } catch (e) {
      return null;
    }
  };

  // ---- reading the plan during play ----
  var read = function (inventory) {
    var v = inventory && inventory.getTag && inventory.getTag("global", TAG);
    return v && v.pvp && v.plan ? v : null;
  };
  var isBattle = function (cfg, starIndex) { return cfg.plan.battleStars.indexOf(starIndex) !== -1; };
  // Stars explored so far, not counting the start system or battle systems.
  var exploredCount = function (game, cfg) {
    var origin = game.galaxy().origin();
    return game.galaxy().stars().filter(function (s, i) { return s.explored() && i !== origin && !isBattle(cfg, i); }).length;
  };
  var picksLeft = function (game, cfg) { return Math.max(0, cfg.plan.cardPicks - exploredCount(game, cfg)); };

  // Player colours for PvP battles: primaries a player can pick (0-255), each with a darker secondary.
  var PALETTE = [
    { name: "Red", rgb: [220, 40, 40] }, { name: "Orange", rgb: [255, 140, 0] }, { name: "Yellow", rgb: [240, 220, 0] },
    { name: "Lime", rgb: [120, 220, 40] }, { name: "Green", rgb: [0, 160, 60] }, { name: "Teal", rgb: [0, 180, 170] },
    { name: "Cyan", rgb: [0, 200, 255] }, { name: "Blue", rgb: [40, 90, 255] }, { name: "Purple", rgb: [150, 60, 220] },
    { name: "Magenta", rgb: [230, 50, 180] }, { name: "White", rgb: [235, 235, 235] }, { name: "Grey", rgb: [130, 130, 130] },
  ];
  var pairFor = function (index) {
    var c = PALETTE[index].rgb;
    return [c.slice(), c.map(function (v) { return Math.round(v * 0.45); })];
  };
  // One palette index per player (host first), from what each asked for. Nobody gets a colour another player
  // already has: a clash or a missing choice moves to the nearest free entry.
  var resolveColors = function (wanted) {
    var taken = [];
    return wanted.map(function (want, i) {
      var start = typeof want === "number" && want >= 0 && want < PALETTE.length ? want : i % PALETTE.length;
      for (var k = 0; k < PALETTE.length; k++) {
        var idx = (start + k) % PALETTE.length;
        if (taken.indexOf(idx) === -1) { taken.push(idx); return idx; }
      }
      return start;
    });
  };

  var api = { PALETTE: PALETTE, pairFor: pairFor, resolveColors: resolveColors, sceneSettings: null, TAG: TAG, active: active, readGame: readGame, apply: apply, settingsFor: settingsFor, sizeIndexFor: sizeIndexFor, read: read, isBattle: isBattle, exploredCount: exploredCount, picksLeft: picksLeft, pickBattleStars: pickBattleStars };
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.mpoWar = api;
})(typeof window !== "undefined" ? window : this);
