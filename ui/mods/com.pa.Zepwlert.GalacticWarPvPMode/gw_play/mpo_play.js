// Galactic War PvP Mode rules during play (gw_play scene). Everything is a no-op unless the war
// carries global.mpo with pvp on, so ordinary wars are untouched. Each hook is wrapped
// separately so one failing cannot take the others, or the stock screen, down.
(function () {
  var W = window.mpoWar;
  var cfgOf = function (game) { return W.readGame(game); };
  // A small status box (bottom left, click to hide) so what the mod does during a Skirmish war can be
  // read without the developer console. Shown only in a Skirmish war.
  var lines = [], box = null;
  var note = function (msg, force) {
    console.log("[Galactic War PvP Mode] " + msg);
    try {
      if (!force && !W.active()) return;
      // The box is the host's debug tool: shown only when "Debug box" was ticked on the start screen.
      var g = model.game && model.game(), c = g && W.readGame(g);
      if (!(c && c.debug)) { if (box) box.style.display = "none"; return; }
      lines.push(msg);
      if (lines.length > 12) lines.shift();
      if (!box) {
        box = document.createElement("div");
        box.style.cssText = "position:fixed;left:8px;top:50%;transform:translateY(-50%);z-index:99999;max-width:520px;padding:6px 8px;" +
          "background:rgba(0,0,0,0.75);color:#9fd;font:11px monospace;white-space:pre-wrap;cursor:pointer;";
        box.onclick = function () { box.style.display = "none"; };
        document.body.appendChild(box);
      }
      box.style.display = "block";
      box.textContent = "PvP Mode status (click to hide)\n" + lines.join("\n");
      var bar = document.createElement("div");
      bar.style.cssText = "margin-top:6px;";
      [["idle", "AI idle"], ["active", "AI active"], ["off", "ordinary"]].forEach(function (v) {
        var b = document.createElement("span");
        var on = (function () { try { return (localStorage.getItem("mpo_variant") || "idle") === v[0]; } catch (e) { return v[0] === "idle"; } })();
        b.textContent = (on ? "[x] " : "[ ] ") + v[1] + "  ";
        b.style.cssText = "cursor:pointer;color:#fd8;";
        b.onclick = function (e) { e.stopPropagation(); try { localStorage.setItem("mpo_variant", v[0]); } catch (x) {} note("battle variant set to " + v[1], true); };
        bar.appendChild(b);
      });
      var lab = document.createElement("div"); lab.textContent = "Battle variant (test):"; lab.style.cssText = "margin-top:6px;";
      box.appendChild(lab); box.appendChild(bar);
    } catch (e) {}
  };
  var safe = function (name, fn) { try { fn(); } catch (e) { console.error("[Galactic War PvP Mode] " + name + " failed:", e); } };

  // Always shown once the war has loaded: whether this is a PvP war, and if not, what is missing.
  safe("load report", function () {
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 100) return clearInterval(timer);
      var game = model.game && model.game();
      if (!game) return;
      clearInterval(timer);
      var why;
      try {
        var tag = game.inventory().getTag("global", "mpo");
        var galaxy = game.galaxy(), star = galaxy.stars()[galaxy.origin()];
        var mark = star && star.system() && star.system().mpo;
        why = "inventory tag: " + (tag ? (tag.pvp ? "pvp on" : "pvp off") + (tag.plan ? ", plan" : ", NO plan") + (tag.status ? " [" + tag.status + "]" : "") + (tag.error ? " ERROR: " + tag.error : "") : "none") +
          "; start system marker: " + (mark ? (mark.pvp ? "pvp on" : "pvp off") + (mark.plan ? ", plan" : ", NO plan") : "none");
      } catch (e) { why = "could not read: " + (e && e.message || e); }
      var d = "";
      try { d += "\nlast launch: " + (localStorage.getItem("mpo_launch") || "none"); } catch (e) {}
      try { d += "\nstart-screen log: " + (localStorage.getItem("mpo_diag") || "empty"); } catch (e) {}
      note("PvP Mode loaded. PvP war: " + (W.readGame(game) ? "YES" : "NO") + ". " + why + d, true);
    }, 200);
  });

  // GW's own game rules: no exploring past the pick count, no fighting before the picks are used,
  // and a lost battle still counts, since in a PvP battle somebody always loses.
  safe("game rules", function () {
    requireGW(["shared/gw_game"], function (GWGame) {
      var P = GWGame.prototype;
      var explore = P.explore, fight = P.fight, winTurn = P.winTurn, loseTurn = P.loseTurn;
      var onBattleStar = function (game, cfg) { return W.isBattle(cfg, game.currentStar()); };

      P.explore = function () {
        var cfg = cfgOf(this);
        if (cfg && W.picksLeft(this, cfg) < 1) return false;
        return explore.apply(this, arguments);
      };
      P.fight = function () {
        var cfg = cfgOf(this);
        if (cfg && onBattleStar(this, cfg)) {
          if (W.picksLeft(this, cfg) > 0) return false;
          // Alone, the battle is the normal one against the placeholder AI: toPvp leaves it as it is.
        }
        return fight.apply(this, arguments);
      };
      P.winTurn = function () {
        var game = this, cfg = cfgOf(game);
        var result = winTurn.apply(game, arguments);
        if (cfg) {
          $.when(result).then(function () {
            // Picks used up: nothing is left to explore, so close every remaining explore target.
            if (W.picksLeft(game, cfg) < 1)
              game.galaxy().stars().forEach(function (s, i) { if (!W.isBattle(cfg, i)) s.explored(true); });
          });
        }
        return result;
      };
      P.loseTurn = function () {
        var cfg = cfgOf(this);
        if (cfg && onBattleStar(this, cfg) && this.turnState() === "fight") {
          this.winTurn(-1);
          return true;
        }
        return loseTurn.apply(this, arguments);
      };
    });
  });

  // Cards shown per pick is exactly the setting: no bonus card for a full hand or Lucky. And no rerolls:
  // rerollsRemain is what every GWO path asks, so answering no there removes the button and its use.
  // Both fall back to the war's own settings when the inventory handed in carries none.
  safe("cards shown", function () {
    requireGW(["coui://ui/mods/com.pa.quitch.gwaioverhaul/shared/cards_deal_helpers.js"], function (helpers) {
      var count = helpers.cardsOfferedCount, remain = helpers.rerollsRemain;
      helpers.cardsOfferedCount = function (offer, inventory) {
        var cfg = W.settingsFor(inventory) || W.active();
        var n = cfg ? cfg.cardsShown : count.apply(this, arguments);
        if (cfg) note("cards offered for a deal: " + n + (inventory && inventory.getTag && inventory.getTag("global", "mpo") ? " (tagged inventory)" : " (untagged inventory)"));
        return n;
      };
      if (remain)
        helpers.rerollsRemain = function () {
          return W.active() ? false : remain.apply(this, arguments);
        };
    });
  });

  // No rerolls: GWO offers them through model.gwoOfferRerolls, which it creates later.
  safe("rerolls", function () {
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 100) return clearInterval(timer);
      var game = model.game && model.game();
      if (!game || !model.gwoOfferRerolls) return;
      clearInterval(timer);
      if (!W.active() && !cfgOf(game)) return;
      model.gwoOfferRerolls(false);
      model.gwoOfferRerolls.subscribe(function (v) { if (v) model.gwoOfferRerolls(false); });
    }, 100);
  });

  // The launch. GW builds the battle in steps: hire (one human army and the AI armies), the co-op
  // referee, the per-player referee (one army per human, own tag), then continueLaunch, which mounts the
  // files and reads referee.config(). The armies are made hostile at two points, either of which is enough:
  // right after the per-player referee, and again just before mountFiles on the referee itself, which
  // is certainly after every step that builds armies. Wrapped on the first fight, not at load, because
  // GWO replaces these functions too and this has to sit on top of that. With fewer than two human
  // armies (a single player) toPvp changes nothing and the battle is the ordinary one.
  // The battle launch navigates away from this screen, so its notes are also kept in localStorage and
  // shown by the status box when the war screen is next opened.
  var keepLaunch = function (msg) {
    try {
      var all = JSON.parse(localStorage.getItem("mpo_launch") || "[]");
      all.push(new Date().toISOString().slice(11, 19) + " " + msg);
      localStorage.setItem("mpo_launch", JSON.stringify(all.slice(-6)));
    } catch (e) {}
  };
  // Chosen with the buttons in the status box and kept in localStorage: "idle" (humans hostile, the AI
  // armies stay but have almost no income: the default, because the battle server crashes with no AI
  // army at all), "active" (humans hostile, AI plays normally as a third side) and "off" (the ordinary
  // battle, nothing changed).
  var variant = function () { try { return localStorage.getItem("mpo_variant") || "idle"; } catch (e) { return "idle"; } };
  var makeHostile = function (referee, where) {
    try {
      var cfg = cfgOf(referee.game());
      if (!cfg) { note("launch (" + where + "): not a Skirmish war"); return; }
      var config = referee.config();
      if (!config) { note("launch (" + where + "): no battle config yet"); return; }
      if (config.mpo_pvp) return;
      if (variant() === "off") { var m = "variant off: ordinary battle, nothing changed (" + where + ")"; note(m); keepLaunch(m); config.mpo_pvp = true; return; }
      var before = config.armies.map(function (a) {
        return ((a.slots || []).some(function (s) { return s && s.ai; }) ? "AI" : "human") + "/g" + a.alliance_group;
      });
      var result = window.mpoReferee.toPvp(config, cfg, variant() === "active" ? "active" : "idle");
      if (result.ok) {
        // An idle AI cannot act: its commander is stripped of orders and weapons and made fragile, so it neither
        // moves nor builds, and the match can still be won by destroying it.
        try {
          var files = referee.files() || {};
          result.idle.forEach(function (army) {
            var key = army.slots && army.slots[0] && army.slots[0].commander;
            var raw = key && files[key];
            if (!raw) { note("idle AI: commander spec not found (" + key + "); only its income was cut"); return; }
            var spec = typeof raw === "string" ? JSON.parse(raw) : raw;
            spec.command_caps = [];
            spec.tools = [];
            spec.max_health = 300;
            files[key] = typeof raw === "string" ? JSON.stringify(spec) : spec;
            if (config.files && config.files !== files) config.files[key] = files[key];
            note("idle AI: commander stripped of orders and weapons");
            keepLaunch("idle AI stripped: " + key.split("/").pop());
          });
        } catch (e) { note("idle AI failed: " + (e && e.message || e)); }
        // Each player's chosen colour: the host's from the war's settings, the others' from the loadout they sent.
        try {
          var clients = (model.gwCampaignConnectedClients && model.gwCampaignConnectedClients()) || [];
          var humanArmies = config.armies.filter(window.mpoReferee.isHuman);
          var wanted = humanArmies.map(function (army, i) {
            if (i === 0) return cfg.color;
            var rec = clients[i] && referee.game().findCoopPlayerInventoryData({ id: clients[i].id, name: clients[i].name });
            var tags = rec && rec.inventory && rec.inventory.tags && rec.inventory.tags.global;
            return tags && typeof tags.mpoColor === "number" ? tags.mpoColor : undefined;
          });
          keepLaunch("colour picks wanted: " + JSON.stringify(wanted) + "; clients: " + clients.map(function (c) { return c && c.name; }).join(", "));
          var picked = W.resolveColors(wanted);
          humanArmies.forEach(function (army, i) { army.color = W.pairFor(picked[i]); });
          keepLaunch("colours " + picked.map(function (i) { return W.PALETTE[i].name; }).join(", "));
        } catch (e) { note("colours failed: " + (e && e.message || e)); }
        referee.config(config);
        var msg = "PvP battle (" + where + "): " + result.humans + " human armies, AI armies kept: " + result.ai + " (dropped " + result.dropped + "), variant " + variant() + ", mode " + cfg.mode + ". Before: " + before.join(", ") +
          ". After: " + config.armies.map(function (a) { return "g" + a.alliance_group + "/" + a.spec_tag; }).join(", ");
        note(msg); keepLaunch(msg);
      } else {
        var msg2 = "ordinary battle (" + where + "): " + result.reason + ". Armies: " + before.join(", ");
        note(msg2); keepLaunch(msg2);
      }
    } catch (e) {
      note("PvP armies failed (" + where + "): " + (e && e.message || e));
      console.error(e);
    }
  };

  // Each module is wrapped on the first fight, and each in its own require so one missing cannot stop the other.
  var onFirstLaunch = function (fn) {
    var done = false;
    model.launchingFight.subscribe(function (launching) {
      if (!launching || done) return;
      done = true;
      note("fight launching"); keepLaunch("fight launching");
      fn();
    });
  };

  safe("pvp launch (per-player step)", function () {
    requireGW(["pages/gw_play/gw_per_player_tech_referee"], function (PerPlayer) {
      onFirstLaunch(function () {
        var apply = PerPlayer.apply;
        PerPlayer.apply = function (referee) {
          var done = apply.apply(this, arguments);
          return done.then(function (prepared) {
            if (prepared) makeHostile(referee, "after per-player step");
            return prepared;
          });
        };
      });
    });
  });

  safe("pvp launch (before mount)", function () {
    requireGW(["pages/gw_play/gw_referee"], function (Referee) {
      onFirstLaunch(function () {
        if (!Referee || !Referee.hire) return;
        var hire = Referee.hire;
        Referee.hire = function () {
          return hire.apply(this, arguments).then(function (referee) {
            try {
              var mount = referee.mountFiles;
              referee.mountFiles = function () {
                makeHostile(referee, "before mounting files");
                return mount.apply(this, arguments);
              };
            } catch (e) { console.error(e); }
            return referee;
          });
        };
      });
    });
  });

  // Which co-op deal is installed: GWO's honours the cards-shown setting, stock's always deals three.
  safe("deal check", function () {
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 60) return clearInterval(timer);
      if (!model.dealCoopPlayerPendingTechCards || !model.game || !model.game()) return;
      clearInterval(timer);
      if (!W.active()) return;
      var src = String(model.dealCoopPlayerPendingTechCards);
      note("co-op card deal in use: " + (src.indexOf("hostingPerPlayerSession") !== -1 || src.indexOf("collectPendingTechTargets") !== -1 ? "GWO's" : "STOCK (always 3 cards)"));
      var deal = model.dealCoopPlayerPendingTechCards;
      model.dealCoopPlayerPendingTechCards = function () {
        var result = deal.apply(this, arguments);
        $.when(result).then(function () {
          try {
            model.game().coopPlayerInventoryData().forEach(function (rec) {
              if (rec && rec.pendingTechCards) note("viewer hand dealt: " + (rec.pendingTechCards.cards || []).length + " cards");
            });
          } catch (e) {}
        });
        return result;
      };
    }, 500);
  });
})();
