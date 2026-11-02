// The co-op loadout scene, where every player but the host builds their starting inventory.
// That scene has no war in its view model, but buildStartingInventory is handed the campaign
// galaxy and its start system, which carries the war's settings. Reading them there lets the
// card slot rules in mpo_cards.js apply to the inventory being built.
// In a PvP war the scene also gets a colour row: the pick is written into the inventory that is sent to the
// host (tags.global.mpoColor), and the host reads it back when it builds the battle.
(function () {
  var chosen = -1; // palette index, -1 until the player picks

  try {
    var tries = 0;
    var timer = setInterval(function () {
      if (++tries > 200) return clearInterval(timer);
      if (typeof model === "undefined" || !model || typeof model.buildStartingInventory !== "function") return;
      clearInterval(timer);
      var build = model.buildStartingInventory;
      model.buildStartingInventory = function (loadoutCardId, commander, galaxy, star) {
        try {
          var m = star && star.system && star.system() && star.system()[window.mpoWar.TAG];
          window.mpoWar.sceneSettings = m && m.pvp && m.plan ? m : null;
        } catch (e) {
          console.error("[Galactic War PvP Mode] loadout scene could not read the war settings:", e);
        }
        var made = build.apply(this, arguments);
        if (!window.mpoWar.sceneSettings || chosen < 0) return made;
        return made.then(function (inventory) {
          try {
            inventory.tags = inventory.tags || {};
            inventory.tags.global = inventory.tags.global || {};
            inventory.tags.global.mpoColor = chosen;
          } catch (e) { console.error("[Galactic War PvP Mode] could not attach the colour:", e); }
          return inventory;
        });
      };
    }, 50);
  } catch (e) {
    console.error("[Galactic War PvP Mode] loadout hook failed:", e);
  }

  // The colour row, added once the war is known to be a PvP war.
  try {
    var showRow = function () {
      var host = document.getElementById("new-game-left");
      if (!host || document.getElementById("mpo-colours")) return;
      var box = document.createElement("div");
      box.id = "mpo-colours";
      box.style.cssText = "margin:10px 12px;";
      var label = document.createElement("div");
      label.textContent = "Your colour (PvP mode)";
      label.style.cssText = "margin-bottom:4px;";
      box.appendChild(label);
      var row = document.createElement("div");
      row.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;";
      var swatches = [];
      window.mpoWar.PALETTE.forEach(function (c, i) {
        var sw = document.createElement("span");
        sw.title = c.name;
        sw.style.cssText = "width:22px;height:22px;border:2px solid rgba(255,255,255,.25);border-radius:3px;cursor:pointer;background:rgb(" + c.rgb.join(",") + ");";
        sw.onclick = function () {
          chosen = i;
          swatches.forEach(function (o, j) { o.style.borderColor = j === i ? "#fff" : "rgba(255,255,255,.25)"; o.style.boxShadow = j === i ? "0 0 6px #fff" : "none"; });
        };
        swatches.push(sw);
        row.appendChild(sw);
      });
      box.appendChild(row);
      host.appendChild(box);
    };
    var looks = 0;
    var finder = setInterval(function () {
      if (++looks > 300) return clearInterval(finder);
      if (typeof model === "undefined" || !model || typeof model.activeGameId !== "function" || !model.activeGameId()) return;
      clearInterval(finder);
      requireGW(["shared/gw_common"], function (GW) {
        GW.manifest.loadGame(model.activeGameId()).then(function (game) {
          try {
            var galaxy = game.galaxy(), star = galaxy.stars()[galaxy.origin()];
            var m = star && star.system() && star.system()[window.mpoWar.TAG];
            if (m && m.pvp && m.plan) showRow();
          } catch (e) { console.error("[Galactic War PvP Mode] colour row failed:", e); }
        });
      });
    }, 100);
  } catch (e) {
    console.error("[Galactic War PvP Mode] colour row hook failed:", e);
  }
})();
