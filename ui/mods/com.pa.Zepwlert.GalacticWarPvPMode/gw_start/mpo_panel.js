// Adds the Galactic War PvP Mode panel under the co-op panel on the Galactic War commander
// screen, and records the chosen settings in the new war's inventory tags (global.mpo),
// where gw_play and the referee can read them. Injected before ko.applyBindings runs,
// like GWO's own setup.js, and wrapped so a failure cannot break the stock screen.
(function () {
  try {
    var S = window.mpoSettings;
    var KEY = "mpo_settings";

    var load = function () {
      try { return S.sanitize(JSON.parse(localStorage.getItem(KEY))); } catch (e) { return S.sanitize({}); }
    };
    var save = function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

    var saved = load();
    // A numeric field that cannot hold an out-of-range value: typing 99 stores 20.
    var numeric = function (name) {
      var raw = ko.observable(saved[name]);
      return ko.computed({
        read: raw,
        write: function (v) {
          var n = S.clamp(v, S.LIMITS[name]);
          raw(n);
          if (String(v) !== String(n)) raw.valueHasMutated();
        },
      });
    };
    var mpo = {
      pvp: ko.observable(saved.pvp),
      mode: ko.observable(saved.mode),
      cardPicks: numeric("cardPicks"),
      cardsShown: numeric("cardsShown"),
      battles: numeric("battles"),
      color: ko.observable(saved.color),
      debug: ko.observable(saved.debug),
      palette: window.mpoWar.PALETTE.map(function (c, i) { return { name: c.name, css: "rgb(" + c.rgb.join(",") + ")", index: i }; }),
    };
    mpo.pick = function (swatch) { mpo.color(swatch.index); };
    mpo.value = ko.computed(function () {
      return S.sanitize({ pvp: mpo.pvp(), mode: mpo.mode(), cardPicks: mpo.cardPicks(), cardsShown: mpo.cardsShown(), battles: mpo.battles(), color: mpo.color(), debug: mpo.debug() });
    });
    mpo.value.subscribe(save);
    model.mpo = mpo;

    var html =
      '<div class="mpo-panel">' +
      '<div class="mpo-title"><loc>Galactic War PvP Mode</loc></div>' +
      '<label class="mpo-row"><span><loc>PVP Skirmish</loc></span><input id="mpo-pvp" type="checkbox" data-bind="checked: mpo.pvp"/></label>' +
      '<div data-bind="visible: mpo.pvp">' +
      '<div class="mpo-row"><span><loc>Game mode</loc></span><select id="mpo-mode" data-bind="value: mpo.mode"><option value="ffa">Free for all</option><option value="team">Team deathmatch</option></select></div>' +
      '<div class="mpo-row"><span><loc>Card picks</loc></span><input id="mpo-picks" type="number" min="1" max="20" data-bind="value: mpo.cardPicks"/></div>' +
      '<div class="mpo-row"><span><loc>Cards shown per pick</loc></span><input id="mpo-shown" type="number" min="1" max="5" data-bind="value: mpo.cardsShown"/></div>' +
      '<div class="mpo-row"><span><loc>Amount of battles</loc></span><input id="mpo-battles" type="number" min="1" max="20" data-bind="value: mpo.battles"/></div>' +
      '<div class="mpo-row"><span><loc>Your colour</loc></span></div>' +
      '<div class="mpo-swatches" data-bind="foreach: mpo.palette">' +
      '<span class="mpo-swatch" data-bind="style: { background: css }, attr: { title: name }, css: { picked: $root.mpo.color() === index }, click: $root.mpo.pick"></span>' +
      "</div>" +
      '<label class="mpo-row"><span><loc>Debug box</loc></span><input id="mpo-debug" type="checkbox" data-bind="checked: mpo.debug"/></label>' +
      '<div class="mpo-note"><loc>One line of systems, sized by picks + battles (galaxy size is ignored). No AI, Guardians, Sub or Lucky Commander, rerolls or Data Bank picks. Needs two or more players.</loc></div>' +
      "</div></div>";
    $(".coop-setup-panel").first().after(html);

    // Stamp the settings into every war this screen creates.
    var stamp = function (game) {
      if (!game || !game.inventory) return;
      game.inventory().setTag("global", S.TAG, mpo.value());
    };
    model.newGame.subscribe(stamp);
    mpo.value.subscribe(function () { stamp(model.newGame()); });
  } catch (e) {
    console.error("[Galactic War PvP Mode] gw_start panel failed:", e);
  }
})();

// Sub Commander (General Commander) and Lucky Commander loadouts: shown locked, as GWO shows a loadout a race cannot use,
// while PVP Skirmish is on. Separate from the panel so a failure here leaves the panel working.
(function () {
  try {
    var BLOCKED = ["gwc_start_subcdr", "gwaio_start_lucky"]; // Sub Commander, Lucky Commander
    var idOf = function (card) { return card && _.isFunction(card.id) ? card.id() : card && card.id; };
    var patched = [];
    var lock = function () {
      var cards = model.startCards ? model.startCards() : [];
      cards.forEach(function (card) {
        if (BLOCKED.indexOf(idOf(card)) === -1 || patched.indexOf(card) !== -1) return;
        patched.push(card);
        var activate = card.activate, btnClass = card.btnClass;
        card.activate = function () { if (!model.mpo.pvp()) return activate && activate.apply(this, arguments); };
        if (_.isFunction(btnClass))
          card.btnClass = ko.computed(function () { return btnClass() + (model.mpo.pvp() ? " gwo-race-locked" : ""); });
      });
      if (model.mpo.pvp() && model.activeStartCard && BLOCKED.indexOf(idOf(model.activeStartCard())) !== -1) {
        var other = _.findIndex(cards, function (c) { return BLOCKED.indexOf(idOf(c)) === -1 && !c.gwoRaceLocked; });
        if (other !== -1) model.activeStartCardIndex(other);
      }
    };
    model.mpo.pvp.subscribe(lock);
    if (model.startCards) model.startCards.subscribe(lock);
    lock();
  } catch (e) {
    console.error("[Galactic War PvP Mode] sub commander lock failed:", e);
  }
})();

// PVP Skirmish ignores the galaxy size setting (the line is as long as picks + battles) but GW still generates a
// stock galaxy first, so the size is moved to the smallest one that holds the line. It also needs every human to have
// their own army and cards, so per-player tech is switched on and shared control off.
(function () {
  try {
    requireGW(["shared/gw_common"], function (GW) {
      var apply = function () {
        try {
        var v = model.mpo.value();
        if (!v.pvp) return;
        var want = window.mpoWar.sizeIndexFor(v, GW.balance.numberOfSystems);
        if (model.newGameSizeIndex && model.newGameSizeIndex() !== want) model.newGameSizeIndex(want);
        if (model.newGamePerPlayerTechCards && !model.newGamePerPlayerTechCards()) model.newGamePerPlayerTechCards(true);
        if (model.newGameSharedByDefault && model.newGameSharedByDefault()) model.newGameSharedByDefault(false);
        if (model.newGameCoopPlayers && !(parseInt(model.newGameCoopPlayers()) >= 2)) model.newGameCoopPlayers("2");
        // Each player picks their own race (GWO's per-player race), so Bugs and Legion players can take theirs.
        if (model.draftNewGamePerPlayerTechCards && !model.draftNewGamePerPlayerTechCards()) model.draftNewGamePerPlayerTechCards(true);
        if (model.gwoDraftPerPlayerRace && !model.gwoDraftPerPlayerRace()) model.gwoDraftPerPlayerRace(true);
        var gwo = model.gwoDifficultySettings;
        if (gwo && gwo.perPlayerRace && !gwo.perPlayerRace()) gwo.perPlayerRace(true);
        } catch (e) { console.error("[Galactic War PvP Mode] size/co-op forcing failed:", e); } // never break the panel's own bindings
      };
      model.mpo.value.subscribe(apply);
      if (model.newGameSizeIndex && model.newGameSizeIndex.subscribe) model.newGameSizeIndex.subscribe(apply);
      apply();
    });
  } catch (e) {
    console.error("[Galactic War PvP Mode] size/co-op forcing failed:", e);
  }
})();
