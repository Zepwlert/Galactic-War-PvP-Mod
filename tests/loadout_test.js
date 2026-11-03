// The co-op loadout scene's colour row and the colour carried in the inventory it sends.
var path = require("path"), assert = require("assert");
var MOD = path.resolve(__dirname, "../ui/mods/com.pa.zepwlert.galacticwarpvpmode/");
var pw = require("playwright");
(async function () {
  var b = await pw.chromium.launch(), p = await b.newPage(); p.setDefaultTimeout(8000); var errs = [];
  p.on("pageerror", function (e) { errs.push(String(e)); });
  await p.addInitScript(function () { delete Object.assign; }); await p.route("http://gw.test/", function (r) { r.fulfill({ contentType: "text/html", body: '<html><body><div id="new-game-left"></div></body></html>' }); });
  await p.goto("http://gw.test/");
  await p.evaluate(function () {
    var sys = { mpo: { pvp: true, plan: {} } };
    var star = { system: function () { return sys; } };
    var game = { galaxy: function () { return { stars: function () { return [star]; }, origin: function () { return 0; } }; } };
    window.requireGW = function (ids, cb) { cb({ manifest: { loadGame: function () { return { then: function (f) { f(game); } }; } } }); };
    var thenable = function (v) { return { then: function (f) { return thenable(f ? f(v) : v); } }; };
    window.ko = { computed: function (fn) { return function () { return fn(); }; } };
    var mkCard = function (id) { var c = { id: function () { return id; }, hits: 0, btnClass: function () { return "btn"; } }; c.activate = function () { c.hits++; }; return c; };
    var list = [mkCard("gwc_start_combatcdr"), mkCard("gwc_start_air"), mkCard("gwaio_start_backpacker"), mkCard("gwc_start_subcdr")], idx = 0, subs = [];
    window.__list = function () { return list; }; window.__rebuild = function () { list = [mkCard("gwaio_start_backpacker"), mkCard("gwc_start_air")]; subs.forEach(function (f) { f(list); }); };
    window.model = { activeGameId: function () { return "g"; }, buildStartingInventory: function () { return thenable({ tags: { global: {} } }); },
      startCards: (function () { var f = function () { return list; }; f.subscribe = function (cb) { subs.push(cb); }; return f; })(),
      activeStartCardIndex: function (i) { if (i === undefined) return idx; idx = i; }, activeStartCard: function () { return list[idx]; } };
    window.__star = star;
  });
  await p.addScriptTag({ path: MOD + "/gw_start/mpo_war.js" }); await p.addScriptTag({ path: MOD + "/gw_coop_per_player_loadout/mpo_loadout.js" });
  await p.waitForSelector("#mpo-colours"); assert.equal(await p.locator("#mpo-colours span").count(), 12);
  await p.locator("#mpo-colours span").nth(5).click();
  var tag = await p.evaluate(function () { var got; window.model.buildStartingInventory("x", "c", {}, window.__star).then(function (i) { got = i.tags.global.mpoColor; }); return got; });
  assert.equal(tag, 5);
  // Combat, Backpacker and Sub Commander are locked in the loadout scene, and the selection leaves a locked card
  var locked = await p.evaluate(function () { var l = window.__list(); return { flags: l.map(function (c) { return !!c.gwoRaceLocked; }), cls: /gwo-race-locked/.test(l[0].btnClass()), active: window.model.activeStartCardIndex(), hit: (l[0].activate(), l[0].hits) }; });
  assert.deepEqual(locked.flags, [true, false, true, true]); assert(locked.cls); assert.equal(locked.active, 1); assert.equal(locked.hit, 0);
  var relocked = await p.evaluate(function () { window.__rebuild(); return window.__list().map(function (c) { return !!c.gwoRaceLocked; }); });
  assert.deepEqual(relocked, [true, false], "the lock follows a rebuilt list");
  // GWO replaces buildStartingInventory after the first wrap: the wrapper must go back on top of it
  var rewrapped = await p.evaluate(function () {
    var th = function (v) { return { then: function (f) { return th(f ? f(v) : v); } }; };
    window.model.buildStartingInventory = function () { return th({ tags: { global: { gwo: true } } }); };
    return new Promise(function (res) { setTimeout(function () { var got; window.model.buildStartingInventory("x", "c", {}, window.__star).then(function (i) { got = i.tags.global; }); res(got); }, 300); });
  });
  assert.equal(rewrapped.gwo, true); assert.equal(rewrapped.mpoColor, 5, "wrapper re-applied on GWO's function");
  assert.deepEqual(errs, []); await b.close(); console.log("loadout ok");
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
