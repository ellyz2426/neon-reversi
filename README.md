# Neon Reversi VR

A spatial Othello/Reversi game built with [IWSDK](https://iwsdk.dev) — playable in VR headsets and desktop browsers.

## 🎮 Play

**[Launch Neon Reversi VR](https://ellyz2426.github.io/neon-reversi/)**

## Features

- **Full Othello rules** — 8×8 board with proper flipping mechanics, pass detection, and scoring
- **VS AI** — Three difficulty levels: Easy (random), Medium (greedy), Hard (minimax with alpha-beta pruning, depth 4)
- **2-Player Local** — Pass-and-play multiplayer on the same device
- **3D Board** — Cylindrical pieces with animated placement and flip effects, pulsing valid-move indicators
- **Spatial PanelUI** — 11 panels including interactive board grid, HUD, achievements, stats, settings, and help
- **25 Achievements** — Corner captures, win streaks, flip milestones, perfect games, difficulty-specific wins
- **5 Neon Themes** — Matrix Green, Electric Blue, Neon Pink, Solar Gold, Cyber Purple
- **Procedural Audio** — Web Audio SFX for placement, flipping, corner captures, wins, losses, draws
- **XR Support** — Follower HUD and spatial board in VR; ScreenSpace UI in browser mode
- **Save/Load** — Statistics and achievement progress persist via localStorage

## Controls

### Browser
- Click valid-move indicators (pulsing spheres) or PanelUI board cells to place pieces
- Use on-screen buttons for navigation and settings

### VR
- Point and select valid-move indicators or panel cells
- B Button to pass turn (when no valid moves available)

## Tech

Built with IWSDK (Immersive Web SDK), Three.js, EliCS ECS, and PanelUI spatial interface.

## License

MIT
