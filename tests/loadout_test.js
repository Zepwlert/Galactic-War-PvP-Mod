// The co-op loadout scene's colour row and the colour carried in the inventory it sends.
var path = require("path"), assert = require("assert");
var MOD = path.resolve(__dirname, "../ui/mods/com.pa.Zepwlert.GalacticWarPvPMode/");
var pw = require("playwright");
(async function () {
  var b = await pw.chromium.launch(), p = await b.newPage(); var errs = [];
  p.on("pageerror", function (e) { errs.push(String(e)); });
  await p.addInitScript(function () { delete Object.assign; }); await p.route("http://gw.test/", function (r) { r.fulfill({ contentType: "text/html", body: '<html><body><div id="new-game-left"></div></body></html>' }); });
  await p.goto("http://gw.test/");
  await p.evaluate(function () {
    var sys = { mpo: { pvp: true, plan: {} } };
    var star = { system: function () { return sys; } };
    var game = { galaxy: function () { return { stars: function () { return [star]; }, origin: function () { return 0; } }; } };
    window.requireGW = function (ids, cb) { cb({ manifest: { loadGame: function () { return { then: function (f) { f(game); } }; } } }); };
    var thenable = function (v) { return { then: function (f) { return thenable(f ? f(v) : v); } }; };
    window.model = { activeGameId: function () { return "g"; }, buildStartingInventory: function () { return thenable({ tags: { global: {} } }); } };
    window.__star = star;
  });
  await p.addScriptTag({ path: MOD + "/gw_start/mpo_war.js" }); await p.addScriptTag({ path: MOD + "/gw_coop_per_player_loadout/mpo_loadout.js" });
  await p.waitForSelector("#mpo-colours"); assert.equal(await p.locator("#mpo-colours span").count(), 12);
  await p.locator("#mpo-colours span").nth(5).click();
  var tag = await p.evaluate(function () { var got; window.model.buildStartingInventory("x", "c", {}, window.__star).then(function (i) { got = i.tags.global.mpoColor; }); return got; });
  assert.equal(tag, 5); assert.deepEqual(errs, []); await b.close(); console.log("loadout ok");
})().catch(function (e) { console.error("FAIL", e); process.exit(1); });
