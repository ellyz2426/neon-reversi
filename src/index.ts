// ============================================================
// NEON REVERSI VR — Classic Othello in a Holographic VR Arena
// Built with IWSDK 0.4.x — playable in VR and browser
// ============================================================

import {
  World, createSystem, PanelUI, PanelDocument, UIKitDocument, UIKit,
  MeshStandardMaterial, MeshBasicMaterial, Mesh,
  Color, Group, PointLight, DirectionalLight, AmbientLight, FogExp2,
  LineSegments, BufferGeometry, Float32BufferAttribute, LineBasicMaterial,
  SphereGeometry, CylinderGeometry, BoxGeometry, Object3D,
  Follower, ScreenSpace, InputComponent,
} from '@iwsdk/core';

// ============================================================
// TYPES
// ============================================================
type Cell = 0 | 1 | 2; // 0=empty, 1=black, 2=white
type Screen = 'title' | 'mode' | 'difficulty' | 'playing' | 'gameover' |
  'achievements' | 'stats' | 'settings' | 'help';
type Diff = 'easy' | 'medium' | 'hard';

interface RuntimeInput {
  keyboard?: { getKeyDown(key: string): boolean; getKeyPressed(key: string): boolean; };
  gamepads: Record<'left'|'right', { getButtonDown(id: string): boolean; getButtonValue(id: string): number; getAxesValues(id: string): { x: number; y: number } | undefined; } | undefined>;
}

const DIRS: [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const CORNERS: [number, number][] = [[0,0],[0,7],[7,0],[7,7]];

// Position weights for AI evaluation
const PW: number[][] = [
  [100,-20,10,5,5,10,-20,100],
  [-20,-50,-2,-2,-2,-2,-50,-20],
  [ 10, -2, 1, 1, 1, 1, -2, 10],
  [  5, -2, 1, 0, 0, 1, -2,  5],
  [  5, -2, 1, 0, 0, 1, -2,  5],
  [ 10, -2, 1, 1, 1, 1, -2, 10],
  [-20,-50,-2,-2,-2,-2,-50,-20],
  [100,-20,10,5,5,10,-20,100],
];

// ============================================================
// BOARD LOGIC
// ============================================================
function createBoard(): Cell[][] {
  const b: Cell[][] = Array.from({ length: 8 }, () => Array(8).fill(0) as Cell[]);
  b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
  return b;
}

function getFlips(board: Cell[][], r: number, c: number, player: Cell): [number, number][] {
  if (board[r][c] !== 0) return [];
  const opp: Cell = (3 - player) as Cell;
  const flips: [number, number][] = [];
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = [];
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === opp) {
      line.push([nr, nc]);
      nr += dr; nc += dc;
    }
    if (line.length > 0 && nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && board[nr][nc] === player) {
      flips.push(...line);
    }
  }
  return flips;
}

function getValidMoves(board: Cell[][], player: Cell): [number, number][] {
  const moves: [number, number][] = [];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (getFlips(board, r, c, player).length > 0)
        moves.push([r, c]);
  return moves;
}

function applyMove(board: Cell[][], r: number, c: number, player: Cell): { nb: Cell[][]; flipped: [number, number][] } {
  const flips = getFlips(board, r, c, player);
  const nb = board.map(row => [...row]) as Cell[][];
  nb[r][c] = player;
  for (const [fr, fc] of flips) nb[fr][fc] = player;
  return { nb, flipped: flips };
}

function countPieces(board: Cell[][]): { b: number; w: number } {
  let b = 0, w = 0;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { if (board[r][c] === 1) b++; else if (board[r][c] === 2) w++; }
  return { b, w };
}

// ============================================================
// AI
// ============================================================
function evaluate(board: Cell[][], aiP: Cell): number {
  const opp: Cell = (3 - aiP) as Cell;
  let score = 0;
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      if (board[r][c] === aiP) score += PW[r][c];
      else if (board[r][c] === opp) score -= PW[r][c];
    }
  score += getValidMoves(board, aiP).length * 5;
  score -= getValidMoves(board, opp).length * 5;
  return score;
}

function minimax(board: Cell[][], player: Cell, depth: number, alpha: number, beta: number, max: boolean, aiP: Cell): number {
  const moves = getValidMoves(board, player);
  const opp: Cell = (3 - player) as Cell;
  if (depth === 0 || (moves.length === 0 && getValidMoves(board, opp).length === 0)) return evaluate(board, aiP);
  if (moves.length === 0) return minimax(board, opp, depth, alpha, beta, !max, aiP);
  if (max) {
    let best = -1e9;
    for (const [r, c] of moves) {
      const { nb } = applyMove(board, r, c, player);
      const v = minimax(nb, opp, depth - 1, alpha, beta, false, aiP);
      best = Math.max(best, v); alpha = Math.max(alpha, v);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = 1e9;
    for (const [r, c] of moves) {
      const { nb } = applyMove(board, r, c, player);
      const v = minimax(nb, opp, depth - 1, alpha, beta, true, aiP);
      best = Math.min(best, v); beta = Math.min(beta, v);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function aiMove(board: Cell[][], player: Cell, diff: Diff): [number, number] | null {
  const moves = getValidMoves(board, player);
  if (moves.length === 0) return null;
  if (diff === 'easy') return moves[Math.floor(Math.random() * moves.length)];
  if (diff === 'medium') {
    let best = moves[0], bv = -1e9;
    for (const [r, c] of moves) {
      const { flipped } = applyMove(board, r, c, player);
      const v = flipped.length * 3 + PW[r][c];
      if (v > bv) { bv = v; best = [r, c]; }
    }
    return best;
  }
  // Hard: minimax depth 4
  const opp: Cell = (3 - player) as Cell;
  let best = moves[0], bv = -1e9;
  for (const [r, c] of moves) {
    const { nb } = applyMove(board, r, c, player);
    const v = minimax(nb, opp, 4, -1e9, 1e9, false, player);
    if (v > bv) { bv = v; best = [r, c]; }
  }
  return best;
}

// ============================================================
// THEMES
// ============================================================
interface Theme { name: string; accent: string; bg: string; fog: string; grid: string; p1: string; p2: string; valid: string; }
const THEMES: Theme[] = [
  { name: 'Neon Holodeck', accent: '#00ffff', bg: '#000a0f', fog: '#000a0f', grid: '#004433', p1: '#00ffff', p2: '#ff33aa', valid: '#ffaa00' },
  { name: 'Crimson Grid', accent: '#ff3366', bg: '#0f0005', fog: '#0f0005', grid: '#440022', p1: '#ff6644', p2: '#4488ff', valid: '#ffcc00' },
  { name: 'Toxic Neon', accent: '#33ff33', bg: '#000f00', fog: '#000f00', grid: '#004400', p1: '#33ff33', p2: '#ff33ff', valid: '#ffff00' },
  { name: 'Ultra Violet', accent: '#aa55ff', bg: '#05000f', fog: '#05000f', grid: '#220044', p1: '#aa55ff', p2: '#55ffaa', valid: '#ff8800' },
  { name: 'Solar Blaze', accent: '#ff8800', bg: '#0f0500', fog: '#0f0500', grid: '#442200', p1: '#ff8800', p2: '#0088ff', valid: '#ff0066' },
];

// ============================================================
// ACHIEVEMENTS
// ============================================================
interface Ach { id: string; name: string; desc: string; chk: (s: Save) => boolean; }
const ACHS: Ach[] = [
  { id: 'first_game', name: 'First Move', desc: 'Complete your first game', chk: s => s.totalGames >= 1 },
  { id: 'ten_games', name: 'Regular', desc: 'Play 10 games', chk: s => s.totalGames >= 10 },
  { id: 'fifty_games', name: 'Dedicated', desc: 'Play 50 games', chk: s => s.totalGames >= 50 },
  { id: 'first_win', name: 'Victor', desc: 'Win your first game', chk: s => s.wins >= 1 },
  { id: 'ten_wins', name: 'Champion', desc: 'Win 10 games', chk: s => s.wins >= 10 },
  { id: 'corner_1', name: 'Corner Stone', desc: 'Capture a corner', chk: s => s.cornerCaptures >= 1 },
  { id: 'corner_10', name: 'Corner Collector', desc: 'Capture 10 corners', chk: s => s.cornerCaptures >= 10 },
  { id: 'corner_all', name: 'Four Corners', desc: 'Hold all 4 corners in one game', chk: s => s.allCorners >= 1 },
  { id: 'dominate', name: 'Domination', desc: 'Win by 30+ pieces', chk: s => s.bestMargin >= 30 },
  { id: 'perfect', name: 'Perfect Game', desc: 'Capture all 64 squares', chk: s => s.bestScore >= 64 },
  { id: 'sweep', name: 'Clean Sweep', desc: 'Win with opponent at 0', chk: s => s.sweeps >= 1 },
  { id: 'comeback', name: 'Comeback King', desc: 'Win after trailing by 10+', chk: s => s.comebacks >= 1 },
  { id: 'fast_win', name: 'Speed Demon', desc: 'Win in under 2 minutes', chk: s => s.fastWins >= 1 },
  { id: 'ai_easy', name: 'Getting Started', desc: 'Beat Easy AI', chk: s => s.aiEasyWins >= 1 },
  { id: 'ai_med', name: 'Strategist', desc: 'Beat Medium AI', chk: s => s.aiMedWins >= 1 },
  { id: 'ai_hard', name: 'Grandmaster', desc: 'Beat Hard AI', chk: s => s.aiHardWins >= 1 },
  { id: 'ai_hard5', name: 'AI Slayer', desc: 'Beat Hard AI 5 times', chk: s => s.aiHardWins >= 5 },
  { id: 'flips_100', name: 'Flipper', desc: 'Flip 100 pieces total', chk: s => s.totalFlips >= 100 },
  { id: 'flips_500', name: 'Flip Master', desc: 'Flip 500 pieces total', chk: s => s.totalFlips >= 500 },
  { id: 'flips_1k', name: 'Flip Legend', desc: 'Flip 1000 pieces total', chk: s => s.totalFlips >= 1000 },
  { id: 'big_flip', name: 'Chain Reaction', desc: 'Flip 10+ in one move', chk: s => s.bestFlip >= 10 },
  { id: 'play_1h', name: 'Time Invested', desc: 'Play 1 hour total', chk: s => s.playTime >= 3600 },
  { id: 'level_5', name: 'Apprentice', desc: 'Reach Level 5', chk: s => s.level >= 5 },
  { id: 'level_10', name: 'Adept', desc: 'Reach Level 10', chk: s => s.level >= 10 },
  { id: 'level_25', name: 'Expert', desc: 'Reach Level 25', chk: s => s.level >= 25 },
];

// ============================================================
// SAVE DATA
// ============================================================
interface Save {
  totalGames: number; wins: number; losses: number; draws: number;
  bestScore: number; bestMargin: number; totalFlips: number; bestFlip: number;
  cornerCaptures: number; allCorners: number; sweeps: number;
  comebacks: number; fastWins: number;
  aiEasyWins: number; aiMedWins: number; aiHardWins: number;
  playTime: number; level: number; xp: number;
  achievements: Set<string>; themeIdx: number;
  masterVol: number; sfxVol: number;
  winStreak: number; bestStreak: number;
}
function defSave(): Save {
  return { totalGames: 0, wins: 0, losses: 0, draws: 0,
    bestScore: 0, bestMargin: 0, totalFlips: 0, bestFlip: 0,
    cornerCaptures: 0, allCorners: 0, sweeps: 0, comebacks: 0, fastWins: 0,
    aiEasyWins: 0, aiMedWins: 0, aiHardWins: 0,
    playTime: 0, level: 1, xp: 0, achievements: new Set(), themeIdx: 0,
    masterVol: 0.8, sfxVol: 0.8, winStreak: 0, bestStreak: 0 };
}
function loadSave(): Save {
  try {
    const raw = localStorage.getItem('neon-reversi-save');
    if (!raw) return defSave();
    const j = JSON.parse(raw); const s = defSave();
    for (const k of Object.keys(s) as (keyof Save)[]) {
      if (j[k] !== undefined) {
        if (k === 'achievements') (s as any)[k] = new Set(j[k]);
        else (s as any)[k] = j[k];
      }
    }
    return s;
  } catch { return defSave(); }
}
function saveSave(s: Save) {
  const j: any = {};
  for (const k of Object.keys(s) as (keyof Save)[]) { const v = s[k]; j[k] = v instanceof Set ? [...v] : v; }
  try { localStorage.setItem('neon-reversi-save', JSON.stringify(j)); } catch {}
}
let save = loadSave();

// ============================================================
// AUDIO
// ============================================================
class Audio {
  ctx: AudioContext | null = null;
  master!: GainNode; sfx!: GainNode;
  init() { this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination); this.sfx = this.ctx.createGain(); this.sfx.connect(this.master); this.setVol(save.masterVol, save.sfxVol); }
  setVol(m: number, s: number) { if (!this.ctx) return; this.master.gain.setValueAtTime(m, this.ctx.currentTime); this.sfx.gain.setValueAtTime(s, this.ctx.currentTime); }
  ensure() { if (!this.ctx) this.init(); if (this.ctx?.state === 'suspended') this.ctx.resume(); }
  private t(freq: number, type: OscillatorType, dur: number, vol: number) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.value = freq * (0.97 + Math.random() * 0.06);
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g); g.connect(this.sfx); o.start(); o.stop(this.ctx.currentTime + dur);
  }
  place() { this.t(660, 'sine', 0.12, 0.2); this.t(880, 'triangle', 0.08, 0.12); }
  flip() { this.t(440 + Math.random() * 200, 'triangle', 0.06, 0.12); }
  invalid() { this.t(200, 'sawtooth', 0.15, 0.15); }
  pass() { this.t(330, 'triangle', 0.2, 0.15); this.t(220, 'sine', 0.15, 0.1); }
  win() { [440,550,660,880,1100,1320].forEach((f,i) => setTimeout(() => this.t(f, 'sine', 0.25, 0.25), i * 80)); }
  lose() { [880,770,660,550,440].forEach((f,i) => setTimeout(() => this.t(f, 'triangle', 0.3, 0.2), i * 120)); }
  draw() { [440,440,660,660].forEach((f,i) => setTimeout(() => this.t(f, 'sine', 0.2, 0.15), i * 120)); }
  click() { this.t(1000, 'sine', 0.04, 0.12); }
  achievement() { [880,1100,1320,1540,1760].forEach((f,i) => setTimeout(() => this.t(f, 'sine', 0.2, 0.2), i * 60)); }
  levelUp() { [440,550,660,770,880,1100].forEach((f,i) => setTimeout(() => this.t(f, 'triangle', 0.25, 0.2), i * 50)); }
  corner() { this.t(880, 'sine', 0.15, 0.25); this.t(1100, 'triangle', 0.12, 0.2); this.t(1320, 'sine', 0.1, 0.15); }
  bigFlip(n: number) { for (let i = 0; i < Math.min(n, 8); i++) setTimeout(() => this.t(440 + i * 80, 'triangle', 0.06, 0.1), i * 40); }
  startDrone() {
    if (!this.ctx) return;
    [55, 82.5, 110].forEach(f => {
      const o = this.ctx!.createOscillator(), g = this.ctx!.createGain();
      o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.025;
      o.connect(g); g.connect(this.master); o.start();
    });
  }
}
const audio = new Audio();

// ============================================================
// 3D PIECES
// ============================================================
const BS = 0.17; // Board cell size
const BX0 = -BS * 3.5, BZ0 = -BS * 3.5, BY = 1.0; // Board origin
const BOARD_Y = BY - 0.01; // Board surface Y

class PieceMgr {
  meshes: (Mesh | null)[][] = [];
  flipAnims: { r: number; c: number; from: Cell; to: Cell; t: number; dur: number }[] = [];
  constructor(private scene: Object3D) {
    for (let r = 0; r < 8; r++) { this.meshes.push([]); for (let c = 0; c < 8; c++) this.meshes[r].push(null); }
  }
  private cellPos(r: number, c: number): [number, number, number] {
    return [BX0 + c * BS, BY + 0.02, BZ0 + r * BS];
  }
  setPiece(r: number, c: number, cell: Cell, th: Theme) {
    if (this.meshes[r][c]) { this.scene.remove(this.meshes[r][c]!); this.meshes[r][c] = null; }
    if (cell === 0) return;
    const geom = new CylinderGeometry(BS * 0.38, BS * 0.38, 0.02, 16);
    const col = cell === 1 ? th.p1 : th.p2;
    const mat = new MeshStandardMaterial({ color: new Color(col), emissive: new Color(col), emissiveIntensity: 0.4, metalness: 0.6, roughness: 0.3 });
    const mesh = new Mesh(geom, mat);
    const [x, y, z] = this.cellPos(r, c);
    mesh.position.set(x, y, z);
    this.scene.add(mesh);
    this.meshes[r][c] = mesh;
  }
  animFlip(r: number, c: number, from: Cell, to: Cell) {
    this.flipAnims.push({ r, c, from, to, t: 0, dur: 0.3 });
  }
  update(dt: number, th: Theme) {
    for (let i = this.flipAnims.length - 1; i >= 0; i--) {
      const a = this.flipAnims[i];
      a.t += dt;
      const p = Math.min(a.t / a.dur, 1);
      const mesh = this.meshes[a.r][a.c];
      if (mesh) {
        mesh.rotation.x = Math.PI * p;
        const scale = Math.abs(Math.cos(Math.PI * p));
        mesh.scale.set(1, Math.max(0.1, scale), 1);
        if (p >= 0.5 && a.from !== 0) {
          const col = a.to === 1 ? th.p1 : th.p2;
          (mesh.material as MeshStandardMaterial).color.set(col);
          (mesh.material as MeshStandardMaterial).emissive.set(col);
          a.from = 0; // Mark color already changed
        }
      }
      if (p >= 1) {
        if (mesh) { mesh.rotation.x = 0; mesh.scale.set(1, 1, 1); }
        this.flipAnims.splice(i, 1);
      }
    }
  }
  clearAll() {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (this.meshes[r][c]) { this.scene.remove(this.meshes[r][c]!); this.meshes[r][c] = null; }
    }
    this.flipAnims.length = 0;
  }
  syncBoard(board: Cell[][], th: Theme) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) this.setPiece(r, c, board[r][c], th);
  }
}

// Valid move indicators
class MoveIndicators {
  meshes: Mesh[] = [];
  constructor(private scene: Object3D) {}
  show(moves: [number, number][], th: Theme) {
    this.clear();
    const geom = new SphereGeometry(BS * 0.12, 8, 8);
    const mat = new MeshBasicMaterial({ color: new Color(th.valid), transparent: true, opacity: 0.6 });
    for (const [r, c] of moves) {
      const m = new Mesh(geom, mat.clone());
      m.position.set(BX0 + c * BS, BY + 0.03, BZ0 + r * BS);
      this.scene.add(m);
      this.meshes.push(m);
    }
  }
  clear() { for (const m of this.meshes) this.scene.remove(m); this.meshes.length = 0; }
  update(time: number) {
    const pulse = 0.4 + Math.sin(time * 4) * 0.3;
    for (const m of this.meshes) (m.material as MeshBasicMaterial).opacity = pulse;
  }
}

// ============================================================
// GAME MANAGER
// ============================================================
class Game {
  screen: Screen = 'title';
  board: Cell[][] = createBoard();
  currentPlayer: Cell = 1; // 1=black starts
  vsAI = false; aiDiff: Diff = 'medium';
  gameStart = 0; gameFlips = 0; gameBestFlip = 0;
  cornersThisGame = 0; wasTrailing = false; trailAmount = 0;
  aiThinking = false; aiDelay = 0;
  passCount = 0;
  achPage = 0; toastQ: string[] = []; toastT = 0;
  playerSide: Cell = 1; // In AI games, player is always black

  startGame(vsAI: boolean, diff?: Diff) {
    this.board = createBoard();
    this.currentPlayer = 1;
    this.vsAI = vsAI;
    if (diff) this.aiDiff = diff;
    this.playerSide = 1;
    this.gameStart = Date.now();
    this.gameFlips = 0; this.gameBestFlip = 0;
    this.cornersThisGame = 0; this.wasTrailing = false; this.trailAmount = 0;
    this.passCount = 0; this.aiThinking = false; this.aiDelay = 0;
    this.screen = 'playing';
  }

  tryPlace(r: number, c: number): boolean {
    if (this.screen !== 'playing') return false;
    if (this.vsAI && this.currentPlayer !== this.playerSide) return false;
    if (this.aiThinking) return false;
    const flips = getFlips(this.board, r, c, this.currentPlayer);
    if (flips.length === 0) { audio.invalid(); return false; }
    this.doMove(r, c);
    return true;
  }

  doMove(r: number, c: number) {
    const { nb, flipped } = applyMove(this.board, r, c, this.currentPlayer);
    this.board = nb;
    this.gameFlips += flipped.length;
    save.totalFlips += flipped.length;
    save.bestFlip = Math.max(save.bestFlip, flipped.length);
    this.gameBestFlip = Math.max(this.gameBestFlip, flipped.length);
    // Check corners
    for (const [cr, cc] of CORNERS) {
      if (r === cr && c === cc) { this.cornersThisGame++; save.cornerCaptures++; audio.corner(); }
    }
    if (flipped.length >= 5) audio.bigFlip(flipped.length); else audio.place();
    this.passCount = 0;
    // Check trailing
    const pc = countPieces(this.board);
    const myC = this.playerSide === 1 ? pc.b : pc.w;
    const oppC = this.playerSide === 1 ? pc.w : pc.b;
    if (oppC - myC >= 10) { this.wasTrailing = true; this.trailAmount = Math.max(this.trailAmount, oppC - myC); }
    this.nextTurn();
  }

  doPass() {
    if (this.screen !== 'playing') return;
    const moves = getValidMoves(this.board, this.currentPlayer);
    if (moves.length > 0) { audio.invalid(); return; } // Can't pass if moves exist
    audio.pass();
    this.passCount++;
    if (this.passCount >= 2) { this.endGame(); return; }
    this.currentPlayer = (3 - this.currentPlayer) as Cell;
    // If new player also has no moves, game over
    if (getValidMoves(this.board, this.currentPlayer).length === 0) { this.endGame(); return; }
    if (this.vsAI && this.currentPlayer !== this.playerSide) { this.aiThinking = true; this.aiDelay = 0.5 + Math.random() * 0.5; }
  }

  nextTurn() {
    const opp: Cell = (3 - this.currentPlayer) as Cell;
    const oppMoves = getValidMoves(this.board, opp);
    const myMoves = getValidMoves(this.board, this.currentPlayer);
    // If neither has moves, game over
    if (oppMoves.length === 0 && myMoves.length === 0) { this.endGame(); return; }
    // Switch to opponent
    this.currentPlayer = opp;
    if (getValidMoves(this.board, this.currentPlayer).length === 0) {
      // Opponent must pass — auto-pass
      this.passCount++;
      if (this.passCount >= 2) { this.endGame(); return; }
      this.currentPlayer = (3 - this.currentPlayer) as Cell;
      if (getValidMoves(this.board, this.currentPlayer).length === 0) { this.endGame(); return; }
    }
    // If AI's turn
    if (this.vsAI && this.currentPlayer !== this.playerSide) {
      this.aiThinking = true;
      this.aiDelay = 0.4 + Math.random() * 0.4;
    }
  }

  updateAI(dt: number) {
    if (!this.aiThinking || this.screen !== 'playing') return;
    this.aiDelay -= dt;
    if (this.aiDelay > 0) return;
    this.aiThinking = false;
    const move = aiMove(this.board, this.currentPlayer, this.aiDiff);
    if (!move) { this.doPass(); return; }
    this.doMove(move[0], move[1]);
  }

  endGame() {
    const pc = countPieces(this.board);
    const elapsed = (Date.now() - this.gameStart) / 1000;
    save.totalGames++;
    save.playTime += elapsed;
    const myC = this.playerSide === 1 ? pc.b : pc.w;
    const oppC = this.playerSide === 1 ? pc.w : pc.b;
    save.bestScore = Math.max(save.bestScore, myC);
    const margin = myC - oppC;
    save.bestMargin = Math.max(save.bestMargin, margin);
    if (myC > oppC) {
      save.wins++; save.winStreak++; save.bestStreak = Math.max(save.bestStreak, save.winStreak);
      if (this.vsAI) {
        if (this.aiDiff === 'easy') save.aiEasyWins++;
        if (this.aiDiff === 'medium') save.aiMedWins++;
        if (this.aiDiff === 'hard') save.aiHardWins++;
      }
      if (oppC === 0) save.sweeps++;
      if (elapsed < 120) save.fastWins++;
      if (this.wasTrailing && this.trailAmount >= 10) save.comebacks++;
      audio.win();
    } else if (myC < oppC) {
      save.losses++; save.winStreak = 0; audio.lose();
    } else {
      save.draws++; audio.draw();
    }
    // Check all 4 corners
    let holdAll = true;
    for (const [cr, cc] of CORNERS) if (this.board[cr][cc] !== this.playerSide) holdAll = false;
    if (holdAll && this.cornersThisGame >= 4) save.allCorners++;
    // XP and level
    save.xp += myC + (myC > oppC ? 20 : 5);
    const oldLvl = save.level;
    save.level = Math.floor(save.xp / 100) + 1;
    if (save.level > oldLvl) { this.toastQ.push('Level Up! ' + save.level); audio.levelUp(); }
    this.checkAch();
    saveSave(save);
    this.screen = 'gameover';
  }

  checkAch() {
    for (const a of ACHS) {
      if (!save.achievements.has(a.id) && a.chk(save)) {
        save.achievements.add(a.id);
        this.toastQ.push(a.name);
        audio.achievement();
      }
    }
  }

  update(dt: number) {
    if (this.toastT > 0) this.toastT -= dt;
    this.updateAI(dt);
  }
}
const game = new Game();

// ============================================================
// PANEL MANAGER
// ============================================================
class Panels {
  docs = new Map<string, UIKitDocument>();
  panelCfg = new Map<string, { entity: any; pos: number[]; scr: Screen[] }>();
  setDoc(n: string, d: UIKitDocument) { this.docs.set(n, d); }
  el(p: string, id: string) { return this.docs.get(p)?.getElementById(id) as UIKit.Text | undefined; }
  st(p: string, id: string, t: string) { this.el(p, id)?.setProperties({ text: t }); }
  oc(p: string, id: string, fn: () => void) { this.el(p, id)?.addEventListener('click', fn); }

  wireTitle() {
    this.st('title', 'level-display', 'Level ' + save.level);
    this.oc('title', 'btn-play', () => { audio.click(); game.screen = 'mode'; this.vis(); });
    this.oc('title', 'btn-achievements', () => { audio.click(); game.achPage = 0; game.screen = 'achievements'; this.updAch(); this.vis(); });
    this.oc('title', 'btn-stats', () => { audio.click(); game.screen = 'stats'; this.updStats(); this.vis(); });
    this.oc('title', 'btn-settings', () => { audio.click(); game.screen = 'settings'; this.vis(); });
    this.oc('title', 'btn-help', () => { audio.click(); game.screen = 'help'; this.vis(); });
  }
  wireMode() {
    this.oc('mode', 'btn-vsai', () => { audio.click(); game.screen = 'difficulty'; this.vis(); });
    this.oc('mode', 'btn-local', () => { audio.click(); game.vsAI = false; game.startGame(false); this.vis(); });
    this.oc('mode', 'btn-back', () => { audio.click(); game.screen = 'title'; this.vis(); });
  }
  wireDiff() {
    this.oc('difficulty', 'btn-easy', () => { audio.click(); game.startGame(true, 'easy'); this.vis(); });
    this.oc('difficulty', 'btn-medium', () => { audio.click(); game.startGame(true, 'medium'); this.vis(); });
    this.oc('difficulty', 'btn-hard', () => { audio.click(); game.startGame(true, 'hard'); this.vis(); });
    this.oc('difficulty', 'btn-back', () => { audio.click(); game.screen = 'mode'; this.vis(); });
  }
  wireBoard() {
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 8; c++)
        this.oc('board', 'c' + r + c, () => { audio.ensure(); game.tryPlace(r, c); });
    this.oc('hud', 'btn-pass', () => { audio.ensure(); game.doPass(); });
  }
  wireGO() {
    this.oc('gameover', 'btn-rematch', () => { audio.click(); game.startGame(game.vsAI, game.aiDiff); this.vis(); });
    this.oc('gameover', 'btn-menu', () => { audio.click(); game.screen = 'title'; this.vis(); });
  }
  wireSettings() {
    const vs = 0.1;
    this.oc('settings', 'btn-master-up', () => { save.masterVol = Math.min(1, save.masterVol + vs); audio.setVol(save.masterVol, save.sfxVol); this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-master-down', () => { save.masterVol = Math.max(0, save.masterVol - vs); audio.setVol(save.masterVol, save.sfxVol); this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-sfx-up', () => { save.sfxVol = Math.min(1, save.sfxVol + vs); audio.setVol(save.masterVol, save.sfxVol); this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-sfx-down', () => { save.sfxVol = Math.max(0, save.sfxVol - vs); audio.setVol(save.masterVol, save.sfxVol); this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-theme-next', () => { save.themeIdx = (save.themeIdx + 1) % THEMES.length; this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-theme-prev', () => { save.themeIdx = (save.themeIdx - 1 + THEMES.length) % THEMES.length; this.updSett(); saveSave(save); });
    this.oc('settings', 'btn-back', () => { audio.click(); game.screen = 'title'; this.vis(); });
  }
  updSett() {
    this.st('settings', 'master-vol', Math.round(save.masterVol * 100) + '%');
    this.st('settings', 'sfx-vol', Math.round(save.sfxVol * 100) + '%');
    this.st('settings', 'theme-name', THEMES[save.themeIdx]?.name || 'Neon');
  }
  wireAch() {
    this.oc('achvlist', 'btn-prev', () => { if (game.achPage > 0) { game.achPage--; this.updAch(); } });
    this.oc('achvlist', 'btn-next', () => { if (game.achPage < Math.ceil(ACHS.length / 12) - 1) { game.achPage++; this.updAch(); } });
    this.oc('achvlist', 'btn-back', () => { audio.click(); game.screen = 'title'; this.vis(); });
  }
  updAch() {
    const pp = 12, start = game.achPage * pp;
    this.st('achvlist', 'ach-count', ACHS.filter(a => save.achievements.has(a.id)).length + '/' + ACHS.length + ' Unlocked');
    this.st('achvlist', 'page-display', (game.achPage + 1) + '/' + Math.ceil(ACHS.length / pp));
    for (let i = 0; i < pp; i++) {
      const a = ACHS[start + i];
      if (a) {
        const done = save.achievements.has(a.id);
        this.st('achvlist', 'ach-' + (i + 1), (done ? '[*] ' : '[ ] ') + a.name + ' - ' + a.desc);
        this.el('achvlist', 'ach-' + (i + 1))?.setProperties({ color: done ? '#ffaa00' : '#666666' });
      } else this.st('achvlist', 'ach-' + (i + 1), '-');
    }
  }
  wireStats() { this.oc('stats', 'btn-back', () => { audio.click(); game.screen = 'title'; this.vis(); }); }
  updStats() {
    this.st('stats', 'stat-1', 'Games: ' + save.totalGames);
    this.st('stats', 'stat-2', 'Wins: ' + save.wins);
    this.st('stats', 'stat-3', 'Losses: ' + save.losses);
    this.st('stats', 'stat-4', 'Draws: ' + save.draws);
    this.st('stats', 'stat-5', 'Win Rate: ' + (save.totalGames ? Math.round(save.wins / save.totalGames * 100) : 0) + '%');
    this.st('stats', 'stat-6', 'Best Score: ' + save.bestScore);
    this.st('stats', 'stat-7', 'Best Margin: +' + save.bestMargin);
    this.st('stats', 'stat-8', 'Total Flips: ' + save.totalFlips);
    this.st('stats', 'stat-9', 'Best Flip: ' + save.bestFlip);
    this.st('stats', 'stat-10', 'Win Streak: ' + save.bestStreak);
    this.st('stats', 'stat-11', 'Play Time: ' + Math.round(save.playTime / 60) + 'm');
    this.st('stats', 'stat-12', 'Level: ' + save.level);
  }
  wireHelp() { this.oc('help', 'btn-back', () => { audio.click(); game.screen = 'title'; this.vis(); }); }
  updHUD() {
    const pc = countPieces(game.board);
    const moves = getValidMoves(game.board, game.currentPlayer);
    const th = THEMES[save.themeIdx] || THEMES[0];
    this.st('hud', 'p1-score', '' + pc.b);
    this.st('hud', 'p2-score', '' + pc.w);
    const turnName = game.currentPlayer === 1 ? 'BLACK' : 'WHITE';
    const aiTag = game.vsAI && game.currentPlayer !== game.playerSide ? ' (AI)' : '';
    this.st('hud', 'turn-indicator', turnName + ' TURN' + aiTag);
    this.st('hud', 'move-count', 'Moves: ' + moves.length);
    // Color the turn indicator
    this.el('hud', 'turn-indicator')?.setProperties({ color: game.currentPlayer === 1 ? th.p1 : th.p2 });
    this.el('hud', 'p1-score')?.setProperties({ color: th.p1 });
    this.el('hud', 'p2-score')?.setProperties({ color: th.p2 });
  }
  updBoard() {
    const th = THEMES[save.themeIdx] || THEMES[0];
    const moves = getValidMoves(game.board, game.currentPlayer);
    const validSet = new Set(moves.map(([r,c]) => r * 8 + c));
    const canPlace = !game.aiThinking && (!game.vsAI || game.currentPlayer === game.playerSide);
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const id = 'c' + r + c;
        const cell = game.board[r][c];
        if (cell === 1) {
          this.st('board', id, 'O');
          this.el('board', id)?.setProperties({ color: th.p1, backgroundColor: '#0a2020', borderColor: th.p1 });
        } else if (cell === 2) {
          this.st('board', id, 'O');
          this.el('board', id)?.setProperties({ color: th.p2, backgroundColor: '#200a15', borderColor: th.p2 });
        } else if (canPlace && validSet.has(r * 8 + c)) {
          this.st('board', id, '+');
          this.el('board', id)?.setProperties({ color: th.valid, backgroundColor: '#1a1a0a', borderColor: '#333300' });
        } else {
          this.st('board', id, ' ');
          this.el('board', id)?.setProperties({ color: '#333333', backgroundColor: '#0a1a0a', borderColor: '#1a3a1a' });
        }
      }
    }
    const statusEl = this.el('board', 'board-status');
    if (statusEl) {
      if (game.aiThinking) this.st('board', 'board-status', 'AI is thinking...');
      else if (moves.length === 0) this.st('board', 'board-status', 'No valid moves - PASS');
      else this.st('board', 'board-status', 'Click + to place');
    }
  }
  updGO() {
    const pc = countPieces(game.board);
    const myC = game.playerSide === 1 ? pc.b : pc.w;
    const oppC = game.playerSide === 1 ? pc.w : pc.b;
    const margin = myC - oppC;
    const elapsed = (Date.now() - game.gameStart) / 1000;
    const mins = Math.floor(elapsed / 60), secs = Math.floor(elapsed % 60);
    if (myC > oppC) this.st('gameover', 'result-text', game.vsAI ? 'YOU WIN!' : 'BLACK WINS!');
    else if (myC < oppC) this.st('gameover', 'result-text', game.vsAI ? 'AI WINS' : 'WHITE WINS!');
    else this.st('gameover', 'result-text', 'DRAW!');
    this.st('gameover', 'score-text', pc.b + ' - ' + pc.w);
    this.st('gameover', 'margin-text', 'Margin: ' + (margin >= 0 ? '+' : '') + margin);
    this.st('gameover', 'flips-text', 'Flips: ' + game.gameFlips);
    this.st('gameover', 'time-text', 'Time: ' + mins + ':' + (secs < 10 ? '0' : '') + secs);
    this.st('gameover', 'xp-text', '+' + (myC + (myC > oppC ? 20 : 5)) + ' XP');
  }
  updToast() {
    if (game.toastT <= 0 && game.toastQ.length > 0) {
      this.st('toast', 'toast-text', game.toastQ.shift()!);
      game.toastT = 2;
    }
    if (game.toastT <= 0) this.st('toast', 'toast-text', ' ');
  }
  vis() {
    this.panelCfg.forEach((cfg) => {
      const v = cfg.scr.includes(game.screen);
      if (cfg.entity?.object3D) {
        if (v) cfg.entity.object3D.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        else cfg.entity.object3D.position.set(0, -100, 0);
      }
    });
    if (game.screen === 'gameover') this.updGO();
    if (game.screen === 'settings') this.updSett();
    if (game.screen === 'playing') { this.updHUD(); this.updBoard(); }
    if (game.screen === 'title') this.st('title', 'level-display', 'Level ' + save.level);
  }
}
const panels = new Panels();

// ============================================================
// GAME SYSTEM
// ============================================================
export class GameSystem extends createSystem({ panelDocs: { required: [PanelDocument] } }) {
  private pMgr!: PieceMgr;
  private indicators!: MoveIndicators;
  private wired = new Set<string>();
  private lastScreen: Screen = 'title';
  private lastBoard = '';
  init() {
    this.pMgr = new PieceMgr(this.scene);
    this.indicators = new MoveIndicators(this.scene);
    this.queries.panelDocs.subscribe('qualify', (entity) => {
      const doc = entity.getValue(PanelDocument, 'document') as UIKitDocument | undefined;
      if (!doc) return;
      const cfg = entity.getValue(PanelUI, 'config') as string | undefined;
      if (!cfg) return;
      const n = cfg.replace('./ui/', '').replace('.json', '');
      if (this.wired.has(n)) return; this.wired.add(n); panels.setDoc(n, doc);
      switch (n) {
        case 'title': panels.wireTitle(); break;
        case 'mode': panels.wireMode(); break;
        case 'difficulty': panels.wireDiff(); break;
        case 'board': panels.wireBoard(); break;
        case 'gameover': panels.wireGO(); break;
        case 'settings': panels.wireSettings(); panels.updSett(); break;
        case 'achvlist': panels.wireAch(); break;
        case 'stats': panels.wireStats(); break;
        case 'help': panels.wireHelp(); break;
      }
      panels.vis();
    });
    this.buildEnv();
  }
  update(dt: number, time: number) {
    game.update(dt);
    const th = THEMES[save.themeIdx] || THEMES[0];
    this.pMgr.update(dt, th);
    this.indicators.update(time);
    panels.updToast();
    // Sync 3D pieces and board panel when game state changes
    if (game.screen === 'playing') {
      const boardKey = game.board.map(r => r.join('')).join('') + game.currentPlayer + (game.aiThinking ? 'T' : 'F');
      if (boardKey !== this.lastBoard) {
        this.lastBoard = boardKey;
        this.pMgr.syncBoard(game.board, th);
        const moves = getValidMoves(game.board, game.currentPlayer);
        const canPlace = !game.aiThinking && (!game.vsAI || game.currentPlayer === game.playerSide);
        this.indicators.show(canPlace ? moves : [], th);
        panels.updHUD();
        panels.updBoard();
      }
    }
    if (game.screen !== this.lastScreen) {
      this.lastScreen = game.screen;
      if (game.screen === 'playing') {
        this.pMgr.syncBoard(game.board, th);
        const moves = getValidMoves(game.board, game.currentPlayer);
        this.indicators.show(moves, th);
      } else {
        this.indicators.clear();
      }
    }
    this.handleInput();
  }
  handleInput() {
    const inp = (this.world as any).input as RuntimeInput | undefined;
    const rGp = inp?.gamepads?.right;
    if (game.screen === 'playing') {
      // VR trigger for pass
      if (rGp?.getButtonDown(InputComponent.B_Button)) { audio.ensure(); game.doPass(); }
    }
  }
  buildEnv() {
    const th = THEMES[save.themeIdx] || THEMES[0];
    this.scene.fog = new FogExp2(new Color(th.fog), 0.04);
    this.scene.add(new AmbientLight(new Color(th.accent), 0.15));
    const dl = new DirectionalLight(0xffffff, 0.4); dl.position.set(5, 10, 5); this.scene.add(dl);
    const al = new PointLight(new Color(th.accent), 1.5, 15); al.position.set(0, 3, -2); this.scene.add(al);
    // Floor grid
    const gs = 40, gd = 40, step = gs / gd, half = gs / 2, gv: number[] = [];
    for (let i = 0; i <= gd; i++) { const p = -half + i * step; gv.push(-half, 0, p, half, 0, p, p, 0, -half, p, 0, half); }
    const gg = new BufferGeometry(); gg.setAttribute('position', new Float32BufferAttribute(gv, 3));
    this.scene.add(new LineSegments(gg, new LineBasicMaterial({ color: new Color(th.grid), transparent: true, opacity: 0.3 })));
    // Board surface
    const boardSize = BS * 8 + 0.04;
    const bg = new BoxGeometry(boardSize, 0.02, boardSize);
    const boardMesh = new Mesh(bg, new MeshStandardMaterial({
      color: new Color('#0a1a0a'), emissive: new Color('#0a1a0a'), emissiveIntensity: 0.2,
      metalness: 0.8, roughness: 0.2, transparent: true, opacity: 0.85
    }));
    boardMesh.position.set(0, BOARD_Y, 0);
    this.scene.add(boardMesh);
    // Board grid lines
    const glv: number[] = [];
    for (let i = 0; i <= 8; i++) {
      const p = BX0 - BS / 2 + i * BS;
      glv.push(p, BOARD_Y + 0.011, BZ0 - BS / 2, p, BOARD_Y + 0.011, BZ0 + 7 * BS + BS / 2);
      glv.push(BX0 - BS / 2, BOARD_Y + 0.011, p, BX0 + 7 * BS + BS / 2, BOARD_Y + 0.011, p);
    }
    const glg = new BufferGeometry(); glg.setAttribute('position', new Float32BufferAttribute(glv, 3));
    this.scene.add(new LineSegments(glg, new LineBasicMaterial({ color: new Color(th.accent), transparent: true, opacity: 0.4 })));
    // Particles
    const pg = new SphereGeometry(0.01, 4, 4), pm = new MeshBasicMaterial({ color: new Color(th.accent), transparent: true, opacity: 0.3 });
    for (let i = 0; i < 80; i++) {
      const d = new Mesh(pg, pm); d.position.set((Math.random() - 0.5) * 20, Math.random() * 5, (Math.random() - 0.5) * 20);
      this.scene.add(d);
    }
  }
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const container = document.getElementById('app') as HTMLDivElement;
  const world = await World.create(container, {
    xr: { offer: 'once' },
    render: { fov: 70, near: 0.01, far: 200, defaultLighting: false, camera: { position: [0, 1.6, 0], lookAt: [0, 1.0, -1.4] } },
    input: { canvasPointerEvents: true },
    features: { grabbing: false, locomotion: { browserControls: true }, physics: false, spatialUI: true },
  } as any);

  const cfgs: { config: string; pos: number[]; scale: number; fol: boolean; scr: Screen[] }[] = [
    { config: './ui/title.json', pos: [0, 1.6, -2.5], scale: 2.5, fol: false, scr: ['title'] },
    { config: './ui/mode.json', pos: [0, 1.6, -2.5], scale: 2.5, fol: false, scr: ['mode'] },
    { config: './ui/difficulty.json', pos: [0, 1.6, -2.5], scale: 2.5, fol: false, scr: ['difficulty'] },
    { config: './ui/board.json', pos: [-0.8, 1.3, -1.8], scale: 1.8, fol: false, scr: ['playing'] },
    { config: './ui/hud.json', pos: [0, 1.9, -2.0], scale: 1.8, fol: true, scr: ['playing'] },
    { config: './ui/gameover.json', pos: [0, 1.6, -2.5], scale: 2.5, fol: false, scr: ['gameover'] },
    { config: './ui/settings.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false, scr: ['settings'] },
    { config: './ui/achvlist.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false, scr: ['achievements'] },
    { config: './ui/stats.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false, scr: ['stats'] },
    { config: './ui/help.json', pos: [0, 1.6, -2.5], scale: 2.0, fol: false, scr: ['help'] },
    { config: './ui/toast.json', pos: [0, 2.2, -2.0], scale: 1.5, fol: true, scr: ['playing', 'gameover', 'title'] },
  ];

  for (const c of cfgs) {
    const entity = world.createTransformEntity();
    entity.addComponent(PanelUI, { config: c.config });
    if (c.fol) {
      entity.addComponent(Follower);
      const off = entity.getVectorView(Follower, 'offsetPosition');
      if (off) { off[0] = c.pos[0]; off[1] = c.pos[1] - 1.6; off[2] = c.pos[2]; }
      entity.addComponent(ScreenSpace);
    }
    if (entity.object3D) { entity.object3D.position.set(c.pos[0], c.pos[1], c.pos[2]); entity.object3D.scale.setScalar(c.scale); }
    panels.panelCfg.set(c.config.replace('./ui/', '').replace('.json', ''), { entity, pos: c.pos, scr: c.scr });
  }

  world.registerSystem(GameSystem);
  panels.vis();
  audio.ensure();
  audio.startDrone();
}

main().catch(console.error);
