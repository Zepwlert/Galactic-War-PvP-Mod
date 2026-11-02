// Card rules for PVP Skirmish, loaded in both gw_start and gw_play (the cards are shared modules, so
// a wrapper installed here applies wherever GWO deals or applies them). All no-ops unless
// mpoWar.settingsFor(inventory) says PVP Skirmish is on.
(function () {
  var W = window.mpoWar;
  var safe = function (name, fn) { try { fn(); } catch (e) { console.error("[Galactic War PvP Mode] " + name + " failed:", e); } };
  var cfgFor = function (inventory) { try { return W.settingsFor(inventory); } catch (e) { return null; } };

  // Never dealt: Sub Commander (tech and loadout), Lucky Commander, and the empty Data Bank pick.
  // Techs that add a slot as part of what they do are untouched; only this pick is removed.
  safe("blocked cards", function () {
    ["gwc_minion", "gwc_start_subcdr", "gwaio_start_lucky", "gwc_add_card_slot"].forEach(function (id) {
      requireGW(["cards/" + id], function (card) {
        var deal = card && card.deal;
        if (!deal) return;
        card.deal = function (star, context, inventory) {
          return cfgFor(inventory) ? { chance: 0 } : deal.apply(this, arguments);
        };
      });
    });
  });

  // Card slots equal the card picks (plus the one the loadout card itself uses). GW's base
  // slots come from gwc_start; two loadouts also shift the count, and both are undone.
  safe("card slots", function () {
    requireGW(["shared/gw_common", "cards/gwc_start"], function (GW, start) {
      var buff = start.buff;
      start.buff = function (inventory) {
        var cfg = cfgFor(inventory);
        var before = inventory.maxCards();
        buff.apply(this, arguments);
        // With at least one pick there is always an empty slot, which GW requires of a loadout.
        if (cfg) inventory.maxCards(before + cfg.cardPicks + 1);
      };
    });
    ["gwaio_start_backpacker", "gwc_start_combatcdr"].forEach(function (id) {
      requireGW(["cards/" + id], function (card) {
        var buff = card && card.buff;
        if (!buff) return;
        card.buff = function (inventory) {
          var cfg = cfgFor(inventory), before = inventory.maxCards();
          buff.apply(this, arguments);
          if (cfg) inventory.maxCards(before);
        };
      });
    });
  });
})();
