// Launch hooks of mpo_play.js with stand-in GW modules.
var fs = require("fs"), path = require("path");
var base = path.join(__dirname, "../ui/mods/com.pa.Zepwlert.GalacticWarPvPMode/");
var els = [];
global.window = global;
global.document = { createElement: function () { return { style: {} }; }, body: { appendChild: function (e) { els.push(e); } } };
global.console = { log: function () {}, error: console.error };
var thenable = function (v) { return { then: function (f) { return thenable(f(v)); } }; };
global.$ = { when: function (x) { return x; } };
var subs = [];
global.model = { launchingFight: { subscribe: function (f) { subs.push(f); } }, game: function () { return game; }, dealCoopPlayerPendingTechCards: function () {} };
var settings = { pvp: true, mode: "ffa", cardsShown: 5, plan: { battleStars: [] } };
var game = { inventory: function () { return { getTag: function () { return settings; } }; }, galaxy: function () { return { stars: function () { return []; }, origin: function () { return 0; } }; } };
var mods = {};
global.requireGW = function (ids, cb) { cb.apply(null, ids.map(function (i) { return mods[i] || { cardsOfferedCount: function (o) { return o; }, rerollsRemain: function () { return true; }, prototype: {} }; })); };
var config = { armies: [
  { slots: [{ name: "A" }], alliance_group: 1 }, { slots: [{ name: "B" }], alliance_group: 1 },
  { slots: [{ ai: true, name: "Enemy" }], alliance_group: 2 }, { slots: [{ ai: true, name: "Sub" }], alliance_group: 1 } ] };
var mounted = false;
var referee = { game: function () { return game; }, config: function (c) { if (c) config = c; return config; }, mountFiles: function () { mounted = true; } };
mods["pages/gw_play/gw_per_player_tech_referee"] = { apply: function () { return thenable(true); } };
mods["pages/gw_play/gw_referee"] = { hire: function () { return thenable(referee); } };
mods["shared/gw_game"] = function () {}; mods["shared/gw_game"].prototype = {};
global.requireGW = (function (orig) { return function (ids, cb) { if (ids[0] === "shared/gw_game") return cb(mods["shared/gw_game"]); orig(ids, cb); }; })(global.requireGW);
["gw_start/mpo_war.js", "gw_start/mpo_referee.js", "gw_play/mpo_play.js"].forEach(function (f) { new Function(fs.readFileSync(base + f, "utf8")).call(global); });
subs.forEach(function (f) { f(true); });
// the hire path first, then mountFiles with no per-player step having run
mods["pages/gw_play/gw_referee"].hire().then(function (r) { r.mountFiles(); });
var ok = mounted && config.armies.length === 3 && config.armies[0].alliance_group !== config.armies[1].alliance_group && config.armies[2].econ_rate === 0 && config.mpo_pvp;
console.error(ok ? "play ok" : "play FAILED " + JSON.stringify(config));
process.exit(ok ? 0 : 1);
