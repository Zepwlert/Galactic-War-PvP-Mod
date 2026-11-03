// NODE_PATH=$(npm root -g) node tests/war_test.js
// Runs GW's real galaxy/star/inventory/game classes in Chromium with the mod's transform and play hooks.
var path = require("path"), fs = require("fs"), assert = require("assert");
var S = path.resolve(__dirname, "../../"), MOD = path.resolve(__dirname, "../ui/mods/com.pa.zepwlert.galacticwarpvpmode/");
var TP = path.join(S, "ui_main/26256781-js/js/thirdparty/"), GWJ = path.join(S, "ui_main/game/game/galactic_war/shared/js/");
var pw = require("playwright");
(async function () {
  var b = await pw.chromium.launch(), p = await b.newPage(); var errs = [];
  p.on("pageerror", function (e) { errs.push(String(e)); }); p.on("console", function (m) { if (m.type() === "error") errs.push(m.text()); });
  await p.addInitScript(function () { delete Object.assign; }); await p.route("http://gw.test/", function (r) { r.fulfill({ contentType: "text/html", body: "<html><body></body></html>" }); });
  await p.goto("http://gw.test/");
  await p.addScriptTag({ path: TP + "jquery-2.1.4.js" }); await p.addScriptTag({ path: TP + "lodash-3.9.3.js" }); await p.addScriptTag({ path: TP + "knockout-3.4.0.min.js" });
  // AMD shim + requireGW shim
  await p.evaluate(function () {
    window.__reg = {}; window.__cardMods = {};
    window.define = function (deps, f) { window.__pending = { deps: deps, f: f }; };
    window.defineAs = function (name, code) {
      (0, eval)(code); var d = window.__pending;
      window.__reg[name] = d.f.apply(null, d.deps.map(function (x) { if (!(x in window.__reg)) throw new Error("missing dep " + x); return window.__reg[x]; }));
    };
    window.requireGW = function (ids, ok) { ok.apply(null, ids.map(function (i) { return window.__reg[i]; })); };
  });
  var load = async function (name, file) { await p.evaluate(function (a) { window.defineAs(a.n, a.c); }, { n: name, c: fs.readFileSync(file, "utf8") }); };
  await p.evaluate(function () { window.__reg["shared/GalaxyBuilder"] = {}; window.__reg["main/game/galactic_war/shared/js/systems/template-loader"] = function () {}; });
  await load("shared/gw_star", GWJ + "gw_star.js"); await load("shared/gw_galaxy", GWJ + "gw_galaxy.js"); await load("shared/gw_stats", GWJ + "gw_stats.js");
  await load("shared/gw_bank", GWJ + "gw_bank.js"); await load("shared/gw_game_patches", GWJ + "gw_game_patches.js");
  await p.evaluate(function () { // inventory needs require(['cards/x']): serve stub cards
    window.__reg.require = function (ids, ok) { ok(window.__reg[ids[0]] || { buff: function (inv) { inv.maxCards(10); }, dull: function () {} }); };
  });
  await load("shared/gw_inventory", GWJ + "gw_inventory.js");
  await load("shared/gw_game", GWJ + "gw_game.js");
  await p.evaluate(function () { // stub the helper + two cards the mod wraps
    window.__reg["coui://ui/mods/com.pa.quitch.gwaioverhaul/shared/cards_deal_helpers.js"] = { cardsOfferedCount: function (o, inv) { return o + 1; }, rerollsRemain: function () { return true; } };
    window.__reg["cards/gwc_minion"] = { deal: function () { return { chance: 40 }; } };
    window.__reg["cards/gwc_start_subcdr"] = { deal: function () { return { chance: 10 }; } };
    window.__reg["cards/gwaio_start_lucky"] = { deal: function () { return { chance: 5 }; } }; window.__reg["cards/gwc_add_card_slot"] = { deal: function () { return { chance: 300 }; } };
    window.__reg["cards/gwc_start"] = { buff: function (inv) { inv.maxCards(inv.maxCards() + 9); }, dull: function () {} };
    window.__reg["cards/gwaio_start_backpacker"] = { buff: function (inv) { inv.maxCards(inv.maxCards() + 12); } }; window.__reg["cards/gwc_start_combatcdr"] = { buff: function (inv) { inv.maxCards(inv.maxCards() - 3); } };
     window.__reg["pages/gw_play/gw_per_player_tech_referee"] = { apply: function () { return $.Deferred().resolve(true).promise(); } };
    
    window.model = { mpo: undefined, game: function () { return window.game; }, launchingFight: ko.observable(false) };
  });
  var script = async function (f) { await p.addScriptTag({ path: path.join(MOD, f) }); };
  await p.evaluate(function () { window.__reg["shared/gw_common"] = { balance: { initialCardSlots: 4 } }; }); await script("gw_start/mpo_war.js");

  // Build a 14-star galaxy with a ring of gates, AIs on odd stars incl. a boss and a treasure planet.
  var setup = function (n, name, cfg) {
    return p.evaluate(function (a) {
      var G = window.__reg["shared/gw_game"], Star = window.__reg["shared/gw_star"];
      var game = new G(a.name); window.game = game;
      var stars = [];
      for (var i = 0; i < a.n; i++) { var s = new Star(); s.system({ planets: _.range(i % 3 === 0 ? 3 : 1), name: "sys" + i, gwaio: i === 0 ? { treasureStar: 5 } : undefined }); s.coordinates([Math.sin(i * 7) * 0.9, Math.cos(i * 5) * 0.9, 0.5]); s.explored(i === 0); if (i) s.ai({ team: i % 4, boss: i === 13, treasurePlanet: i === 5, name: "ai" + i }); s.cardList([{ id: "c" + i }]); stars.push(s); }
      game.galaxy().stars(stars); game.galaxy().origin(0); game.galaxy().gates(stars.map(function (s, i) { return [i, (i + 1) % a.n]; })); game.move(0); game.gameState("active"); game.inventory().maxCards(10);
      window.__lastStar = Star; window.__orig = {}; stars.forEach(function (s) { window.__orig[s.system().name] = s.coordinates().slice(); });
      game.coopPlayerInventoryData([{ playerId: "a", inventory: { tags: {}, cards: [] } }, { playerId: "b", inventory: { cards: [] } }]);
      return window.mpoWar.apply(game, a.cfg, { Star: Star });
    }, { n: n, name: name, cfg: cfg });
  };
  var plan = await setup(14, "g1", { pvp: true, mode: "ffa", cardPicks: 4, cardsShown: 2, battles: 3 });
  assert.equal(plan.cardPicks, 4); assert.deepEqual(plan.battleStars, [5, 6, 7]);
  var kinds = plan.battlePlanets.map(function (n) { return n > 1; }); assert(kinds.indexOf(true) !== -1 && kinds.indexOf(false) !== -1, "mix of single and multi planet systems: " + plan.battlePlanets);
  var line = await p.evaluate(function () {
    var g = window.game.galaxy(), st = g.stars();
    return { n: st.length, gates: g.gates(), origin: g.origin(), ys: st.map(function (s) { return s.coordinates()[1]; }), xs: st.map(function (s) { return s.coordinates()[0]; }),
      ai: st.map(function (s, i) { return s.ai() ? i : -1; }).filter(function (i) { return i >= 0; }), explored: st.map(function (s) { return s.explored(); }), dist: st.map(function (s) { return s.distance(); }),
      bossOrTreasure: st.some(function (s) { return s.ai() && (s.ai().boss || s.ai().treasurePlanet); }), treasure: st[0].system().gwaio.treasureStar,
      per: window.game.perPlayerTechCards(), shared: window.game.sharedByDefault(), cur: window.game.currentStar(), cards: st.map(function (s) { return s.cardList().length; }) };
  });
  assert.equal(line.n, 8); assert.deepEqual(line.gates, [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]]); assert.equal(line.origin, 0);
  var kept = await p.evaluate(function () { return window.game.galaxy().stars().every(function (s) { var o = window.__orig[s.system().name]; return o && o[0] === s.coordinates()[0] && o[1] === s.coordinates()[1]; }); });
  assert(kept, "every system keeps its generated position, so the path stays inside the map");
  var hops = line.xs.map(function (x, i) { return i ? Math.hypot(x - line.xs[i - 1], line.ys[i] - line.ys[i - 1]) : 0; });
  var stamped = await p.evaluate(function () { return window.game.coopPlayerInventoryData().map(function (r) { return !!(r.inventory.tags.global.mpo && r.inventory.tags.global.mpo.cardsShown === 2); }); });
  assert.deepEqual(stamped, [true, true], "every player's saved inventory carries the settings");
  assert.deepEqual(line.ai, [5, 6, 7]); assert.deepEqual(line.explored, [true, false, false, false, false, true, true, true]); assert.deepEqual(line.dist, [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(line.bossOrTreasure, false); assert.equal(line.treasure, -1); assert.strictEqual(line.per, true); assert.strictEqual(line.shared, false); assert.equal(line.cur, 0);
  assert.deepEqual(line.cards.slice(5), [0, 0, 0]);
  console.log("line ok", JSON.stringify(plan));

  // bigger request than the galaxy: systems are reused, the line keeps its length
  var big = await setup(6, "tiny", { pvp: true, cardPicks: 5, cardsShown: 3, battles: 4 });
  assert.equal(big.cardPicks, 5); assert.equal(big.battleStars.length, 4);
  assert.equal(await p.evaluate(function () { return window.game.galaxy().stars().length; }), 10);
  assert(await p.evaluate(function () { return window.game.galaxy().stars().every(function (s) { return Math.abs(s.coordinates()[0]) <= 1 && Math.abs(s.coordinates()[1]) <= 1; }); }), "clones stay in bounds"); console.log("reuse ok");
  assert.equal(await p.evaluate(function () { return window.mpoWar.apply(window.game, { pvp: false }); }), null);
  assert.equal(await p.evaluate(function () { return [18, 24, 36, 54, 78].map(function (_n, i, a) { return window.mpoWar.sizeIndexFor({ cardPicks: 20, battles: 20 }, a); })[0]; }), 3);
  assert.equal(await p.evaluate(function () { return window.mpoWar.sizeIndexFor({ cardPicks: 1, battles: 1 }, [18, 24, 36]); }), 0);

  // play hooks on the line
  await setup(14, "g1", { pvp: true, mode: "ffa", cardPicks: 4, cardsShown: 2, battles: 3 });
  await script("gw_start/mpo_referee.js"); await script("gw_start/mpo_cards.js"); await script("gw_play/mpo_play.js"); await p.evaluate(function (src) { document.__loadoutSrc = src; }, fs.readFileSync(path.join(MOD, "gw_coop_per_player_loadout/mpo_loadout.js"), "utf8"));
  var r = await p.evaluate(async function () {
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var game = window.game, W = window.mpoWar, out = {}; var cfg = W.read(game.inventory()); var bs = cfg.plan.battleStars; var g = game.galaxy();
    out.path = [!!g.pathBetween(0, 1, false), !!g.pathBetween(0, 3, false)];
    var go = function (i) { game.move(i); };
    out.clients = 2; window.model.gwCampaignConnectedClients = function () { return [1, 2]; };
    go(bs[0]); out.fightEarly = game.fight();
    var H = window.__reg["coui://ui/mods/com.pa.quitch.gwaioverhaul/shared/cards_deal_helpers.js"];
    out.deal = H.cardsOfferedCount(3, game.inventory());
    out.dealRecordInv = H.cardsOfferedCount(3, new (window.__reg["shared/gw_inventory"])()); // rebuilt from a record, no tag
    out.reroll = H.rerollsRemain(1, 3);
    out.blocked = ["gwc_minion", "gwc_start_subcdr", "gwaio_start_lucky", "gwc_add_card_slot"].map(function (id) { return window.__reg["cards/" + id].deal(null, null, game.inventory()).chance; });
    out.otherInv = window.__reg["cards/gwc_minion"].deal(null, null, new (window.__reg["shared/gw_inventory"])()).chance;
    out.picksAtStart = W.picksLeft(game, cfg); out.explore = [];
    for (var k = 1; k <= 4; k++) { go(k); out.explore.push(game.explore()); game.winTurn(0); game.turnState("begin"); }
    out.picksAfter = W.picksLeft(game, cfg); await wait(300);
    out.fifth = (go(bs[0]), game.explore()); out.cardsHeld = game.inventory().cards().length;
    window.model.gwCampaignConnectedClients = function () { return [1]; }; out.soloFight = game.fight();
    window.model.gwCampaignConnectedClients = function () { return [1, 2]; };
    out.battles = [];
    bs.forEach(function (b) { go(b); var f = game.fight(); var l = game.loseTurn(); out.battles.push([f, l, !!game.galaxy().stars()[b].ai()]); game.turnState("begin"); });
    out.gameState = game.gameState(); return out;
  });
  assert.deepEqual(r.path, [true, false]); assert.strictEqual(r.fightEarly, false);
  assert.equal(r.deal, 2); assert.equal(r.dealRecordInv, 2); assert.strictEqual(r.reroll, false); assert.deepEqual(r.blocked, [0, 0, 0, 0]); assert.equal(r.otherInv, 0, "a record-built inventory in a PvP war is covered too");
  assert.equal(r.picksAtStart, 4); assert.deepEqual(r.explore, [true, true, true, true]); assert.equal(r.picksAfter, 0);
  assert.strictEqual(r.fifth, false); assert.equal(r.cardsHeld, 4); assert.strictEqual(r.soloFight, true, "a lone player fights the ordinary battle");
  r.battles.forEach(function (x) { assert.strictEqual(x[0], true); assert.strictEqual(x[1], true); assert.strictEqual(x[2], false); });
  assert.equal(r.gameState, "won"); console.log("play ok");

  // the launch: wrapped over the per-player referee step, so the split human armies are what gets turned hostile
  var launch = await p.evaluate(async function () {
    var PT = window.__reg["pages/gw_play/gw_per_player_tech_referee"], out = {};
    var mk = function (armies) { return { game: function () { return window.game; }, config: function (c) { if (c) this.c = c; return this.c; }, c: { armies: armies } }; };
    window.model.launchingFight(true);
    var two = mk([{ slots: [{ name: "A" }], alliance_group: 1, spec_tag: ".player" }, { slots: [{ name: "B" }], alliance_group: 1, spec_tag: ".player0" }, { slots: [{ ai: true }], alliance_group: 2 }]);
    await PT.apply(two, {}); out.two = two.c.armies.map(function (a) { return a.slots[0].ai ? [undefined, a.alliance_group, undefined, a.econ_rate] : [a.slots[0].name, a.alliance_group, a.spec_tag]; });
    var solo = mk([{ slots: [{ name: "A" }], alliance_group: 1 }, { slots: [{ ai: true }], alliance_group: 2 }]);
    await PT.apply(solo, {}); out.solo = solo.c.armies.map(function (a) { return a.alliance_group; });
    // a viewer's copy of the war: their own inventory has no tag, the start system's marker still says PvP
    var G = window.__reg["shared/gw_game"], v = new G("v"); v.galaxy(window.game.galaxy()); out.viewerRead = !!window.mpoWar.readGame(v);
    var vv = new G("v2"); vv.galaxy(window.game.galaxy()); window.game.inventory().tags({}); out.viewerBlocked = window.__reg["cards/gwc_minion"].deal(null, null, vv.inventory()).chance;
    return out;
  });
  assert.deepEqual(launch.two, [["A", 1, ".player"], ["B", 2, ".player0"], [undefined, 3, undefined, 0]]); assert.deepEqual(launch.solo, [1, 2]);
  assert.strictEqual(launch.viewerRead, true); assert.equal(launch.viewerBlocked, 0); console.log("launch ok");

  // the co-op loadout scene: no game, no tag; the settings come from the start system it is handed
  var scene = await p.evaluate(async function () {
    var R = window.__reg, Inv = R["shared/gw_inventory"], out = {};
    var st = window.game.galaxy().stars()[0];
    var mk = function () { return new Promise(function (res) { var inv = new Inv(); inv.load({ cards: [] }); inv.cards(["gwc_start"]); inv.applyCards(function () { res(inv.maxCards()); }); }); };
    window.model.game = undefined; window.mpoWar.sceneSettings = null;
    window.model.buildStartingInventory = function () { return mk(); };
    window.eval(document.__loadoutSrc);
    await new Promise(function (r) { setTimeout(r, 200); });
    out.viewer = await window.model.buildStartingInventory("gwc_start", "cmd", window.game.galaxy(), st);
    st.system().mpo = null; out.ordinary = await window.model.buildStartingInventory("gwc_start", "cmd", window.game.galaxy(), st);
    window.mpoWar.sceneSettings = null;
    return out;
  });
  assert.deepEqual([scene.viewer, scene.ordinary], [4 + 1 + 0 + 0 === 5 ? 5 : 5, 9], "viewer slots = picks + loadout; an ordinary war keeps stock slots");
  console.log("viewer slots ok");

  // an ordinary war is untouched by every wrapper
  var plain = await p.evaluate(function () {
    var R = window.__reg; window.game = new R["shared/gw_game"]("plain"); var H = R["coui://ui/mods/com.pa.quitch.gwaioverhaul/shared/cards_deal_helpers.js"]; var inv = window.game.inventory();
    return [H.cardsOfferedCount(3, inv), H.rerollsRemain(1, 3), R["cards/gwc_minion"].deal(null, null, inv).chance, R["cards/gwc_add_card_slot"].deal(null, null, inv).chance, (R["cards/gwc_start"].buff(inv), inv.maxCards())];
  });
  assert.deepEqual(plain, [4, true, 40, 300, 9]); console.log("plain war untouched ok");

  // slots and the PvP armies
  var slots = await p.evaluate(function () {
    var R = window.__reg, inv = new R["shared/gw_inventory"](); inv.setTag("global", "mpo", { pvp: true, cardPicks: 7 });
    R["cards/gwc_start"].buff(inv); var a = inv.maxCards();
    var inv2 = new R["shared/gw_inventory"](); R["cards/gwc_start"].buff(inv2); var b = inv2.maxCards();
    var inv3 = new R["shared/gw_inventory"](); inv3.setTag("global", "mpo", { pvp: true, cardPicks: 7 }); R["cards/gwaio_start_backpacker"].buff(inv3);
    var inv4 = new R["shared/gw_inventory"](); inv4.setTag("global", "mpo", { pvp: true, cardPicks: 7 }); R["cards/gwc_start_combatcdr"].buff(inv4);
    var blocked = ["gwc_start_combatcdr", "gwaio_start_backpacker"].map(function (id) { return R["cards/" + id].deal ? R["cards/" + id].deal(null, null, inv3).chance : "nodeal"; });
    return [a, b, inv3.maxCards(), inv4.maxCards(), blocked];
  });
  // Backpacker keeps its own extra slots; Combat Commander never leaves fewer slots than the picks (+1) need.
  assert.deepEqual(slots.slice(0, 4), [8, 9, 12, 8]); console.log("slots ok");
  var R2 = require(path.join(MOD, "gw_start/mpo_referee.js"));
  var cfgA = { armies: [{ slots: [{ name: "A" }] }, { slots: [{ name: "B" }] }, { slots: [{ name: "ai", ai: true }] }, { slots: [{ name: "C" }] }, { slots: [{ ai: true }] }] };
  var res = R2.toPvp(JSON.parse(JSON.stringify(cfgA)), { mode: "ffa" }, "remove"); assert(res.ok && res.humans === 3);
  var c1 = JSON.parse(JSON.stringify(cfgA)); R2.toPvp(c1, { mode: "ffa" }, "remove"); assert.equal(c1.armies.length, 3); assert.equal(new Set(c1.armies.map(function (a) { return a.alliance_group; })).size, 3);
  var c2 = JSON.parse(JSON.stringify(cfgA)); R2.toPvp(c2, { mode: "team" }, "remove"); assert.deepEqual(c2.armies.map(function (a) { return a.alliance_group; }), [1, 2, 1]);
  var c3 = JSON.parse(JSON.stringify(cfgA)); R2.toPvp(c3, { mode: "ffa" }); assert.equal(c3.armies.length, 4); assert.deepEqual(c3.armies.map(function (a) { return a.alliance_group; }), [1, 2, 3, 4]); assert.equal(c3.armies[3].econ_rate, 0);
  var solo = { armies: [{ slots: [{}] }, { slots: [{ ai: true }] }] }; var rs = R2.toPvp(solo, { mode: "ffa" }); assert(!rs.ok); assert.equal(solo.armies.length, 2);
  var WW = require(path.join(MOD, "gw_start/mpo_war.js")); assert.deepEqual(WW.resolveColors([3, 3, undefined, 3]), [3, 4, 2, 5]); assert.deepEqual(WW.resolveColors([11, 11]), [11, 0]); assert.deepEqual(WW.pairFor(0)[0], [220, 40, 40]); assert.equal(WW.pairFor(0)[1][0], 99); console.log("colours ok");
  console.log("armies ok");
  errs = errs.filter(function (e) { return !/needs at least two human players/.test(e); }); assert.deepEqual(errs, []); await b.close(); console.log("war ok");
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
