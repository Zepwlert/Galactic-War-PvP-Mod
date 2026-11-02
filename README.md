[README.md](https://github.com/user-attachments/files/34288173/README.md)
# Galactic War PvP Mode

A Planetary Annihilation: Titans client mod by **Zepwlert**. It turns Galactic War co-op into a PvP skirmish:
players pick cards in turn, then fight each other in the battles.

Requires Galactic War Overhaul (GWO, `com.pa.quitch.gwaioverhaul`) and Zep's Chaotic Galactic War Cards (ZGWC, `com.pa.Zepwlert.ZepsChaoticGalacticWarCards`), both declared as dependencies in `modinfo.json`.

## Features

- **Host panel** on the Galactic War start screen: PVP checkbox, free for all or two teams, card picks (1-20),
  cards shown per deal (1-5) and number of battles.
- **A line of systems**: the start, one system per card pick, then the battle systems.
- **Per-player cards**: every player is dealt the amount of cards the host set (viewers included).
- **Hostile armies**: human players start every battle as enemies (free for all) or in two teams.
- **Idle AI**: one AI army stays, with no income and a commander without orders or weapons. The battle server
  crashes when no AI army exists, so one has to remain.
- **Colours**: each player picks one of 12 colours on the commander/loadout screen. Clashes move the later player
  to the next free colour.
- **Win condition**: the last human standing gets "victory", everyone else "annihilated". Killing the AI does not end the match.
- **Status box** (centre-left of the Galactic War screen, click to hide) showing what the mod did, with buttons to
  test "AI active" or "ordinary battle".

## Install

Copy this folder's contents so that `ui/mods/com.pa.Zepwlert.GalacticWarPvPMode/` and `modinfo.json` end up in a
folder in your PA `client_mods` directory (for example `client_mods/com.pa.Zepwlert.GalacticWarPvPMode/`), then enable
it in the in-game Community Mods menu. Every player in the lobby needs it.

## Use

1. In Galactic War, start a co-op war and tick **PVP Skirmish** in the host panel.
2. Each player picks a colour on the commander screen, then cards.
3. Launch the fight. Human armies are hostile; the AI sits idle.

## Development

Tests run in Chromium with Playwright against GW's real classes:

```
NODE_PATH=$(npm root -g) node tests/panel_test.js
NODE_PATH=$(npm root -g) node tests/war_test.js
NODE_PATH=$(npm root -g) node tests/play_test.js
NODE_PATH=$(npm root -g) node tests/loadout_test.js
```

The game's embedded browser lacks `Object.assign`; keep the code free of it.

## Known limits

- Tested with two players (host and one viewer).
- Needs at least two human players.

## License

MIT, see `LICENSE`.
