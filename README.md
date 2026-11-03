# Galactic War PvP Mode

It turns Galactic War co-op into a PvP skirmish: players pick cards, then fight each other in the battles.

Requires Galactic War Overhaul (GWO, `com.pa.quitch.gwaioverhaul`)

Source and bug reports: <https://github.com/Zepwlert/Galactic-War-PvP-Mod>

## Features

* Host panel on the Galactic War start screen: PVP checkbox, free for all or two teams, card picks (1-20), cards shown per deal (1-5) and number of battles.
* A line of systems: the start, one system per card pick, then the battle systems.
* Per-player cards: every player is dealt the amount of cards the host set (viewers included).
* PvP: players start every battle as enemies (free for all) or in two teams.
* Idle AI: one AI army stays, with no income and a commander without orders or weapons. This is required since it'll crash otherwise.
* Colours: each player picks one of 12 colours on the commander/loadout screen. If one is taken already it picks a free one.
* Locked loadouts: the Sub Commander, Lucky Commander, Combat Commander and Backpacker Commander loadouts are locked in PvP mode, for the host and for every viewer on the loadout screen.
* Win condition: the last player standing gets "victory", everyone else "annihilated". Killing the AI does not end the match.
* Debug box (host option, off by default; centre-left of the Galactic War screen, click to hide) showing what the mod did, with buttons to test "AI active" or "ordinary battle". The test buttons only count while the debug box is on.

## Install

Requires [Galactic War Overhaul](https://github.com/Quitch/GW-AI-Overhaul) (`com.pa.quitch.gwaioverhaul`).

Put the folder "GalacticWarPvPMode" in your PA `client_mods` folder and enable it in the in-game Community Mods menu. Every player that joins needs it.

## Use

1. In Galactic War, start a co-op war and enable PVP Skirmish on the left side.
2. Change the settings, how many card picks and how many cards per pick. Finally the amount of battles you want before the session ends. (You don't explore the planet upon completing a battle)
3. Each player picks a colour on the commander screen, then cards.
4. Launch the fight. PvP Enabled and the AI sits idle. (You do need to kill it for the game to end.)

## Known limits

* Tested with two players (on free for all).
* Needs at least two players, otherwise it's just a idle AI.
* Team Deathmatch not tested yet.

## How was it made

I had the idea and since I'm a little nooby coder. It's vibe-coded.
I tested things, pointed in the direction where bugs were at and Claude did Claude things.
Finally I had my big bro pro coder nerd look at it and he said: "yea, it's aight." (although the code style hurt him a little bit on the inside)

## Development

Tests run in Chromium with Playwright against stand-ins for GW's classes:

```
NODE_PATH=$(npm root -g) node tests/panel_test.js
NODE_PATH=$(npm root -g) node tests/war_test.js
NODE_PATH=$(npm root -g) node tests/play_test.js
NODE_PATH=$(npm root -g) node tests/loadout_test.js
```

The game's embedded browser lacks `Object.assign` and CSS `gap` in flex layouts; keep the code free of both.

## License

MIT, see `LICENSE`.
