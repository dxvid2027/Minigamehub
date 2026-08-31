// ==========================================================================
// Daily challenge template pool. The DailyChallenge system deterministically
// picks 3 of these each day (seeded by date) so everyone gets the same set.
// `type` drives how systems/dailyChallenge.js listens for progress:
//   score    -> best single-session score in `gameId` reaches `target`
//   plays    -> `gameId` played `target` times today
//   win      -> `gameId` won `target` times today
//   playtime -> `target` seconds played today (any game, or `gameId` if set)
// ==========================================================================
export const CHALLENGE_POOL = [
  { id: "c_snake_score", type: "score", gameId: "snake", target: 150, label: "Score 150 points in Snake", coins: 40, xp: 35 },
  { id: "c_tetris_score", type: "score", gameId: "tetris", target: 2000, label: "Score 2,000 points in Tetris Blocks", coins: 50, xp: 40 },
  { id: "c_flappy_score", type: "score", gameId: "flappy-bird", target: 15, label: "Score 15 points in Flappy Wings", coins: 35, xp: 30 },
  { id: "c_breakout_score", type: "score", gameId: "breakout", target: 1500, label: "Score 1,500 points in Breakout Arena", coins: 45, xp: 35 },
  { id: "c_space_score", type: "score", gameId: "space-shooter", target: 1200, label: "Score 1,200 points in Nova Strike", coins: 50, xp: 40 },
  { id: "c_runner_score", type: "score", gameId: "endless-runner", target: 800, label: "Score 800 points in Neon Runner", coins: 45, xp: 35 },
  { id: "c_basketball_score", type: "score", gameId: "basketball", target: 8, label: "Sink 8 baskets in Hoop Shot", coins: 40, xp: 30 },
  { id: "c_fruit_score", type: "score", gameId: "fruit-slice", target: 60, label: "Score 60 points in Fruit Slice", coins: 40, xp: 30 },
  { id: "c_2048_score", type: "score", gameId: "2048", target: 512, label: "Reach a 512 tile in 2048", coins: 45, xp: 35 },
  { id: "c_whack_score", type: "score", gameId: "whack-a-mole", target: 200, label: "Score 200 points in Whack-a-Mole", coins: 35, xp: 30 },
  { id: "c_bubble_score", type: "score", gameId: "bubble-shooter", target: 1000, label: "Score 1,000 points in Bubble Shooter", coins: 40, xp: 35 },
  { id: "c_stack_score", type: "score", gameId: "stack-tower", target: 10, label: "Stack 10 blocks in Stack Tower", coins: 35, xp: 30 },

  { id: "c_ttt_win", type: "win", gameId: "tic-tac-toe", target: 3, label: "Win 3 matches of Tic Tac Toe", coins: 40, xp: 35 },
  { id: "c_c4_win", type: "win", gameId: "connect-four", target: 2, label: "Win 2 matches of Connect Four", coins: 45, xp: 35 },
  { id: "c_chess_win", type: "win", gameId: "chess", target: 1, label: "Win 1 match of Chess", coins: 60, xp: 50 },
  { id: "c_checkers_win", type: "win", gameId: "checkers", target: 2, label: "Win 2 matches of Checkers", coins: 45, xp: 35 },
  { id: "c_pong_win", type: "win", gameId: "pong", target: 3, label: "Win 3 matches of Pong Duel", coins: 40, xp: 35 },
  { id: "c_air_win", type: "win", gameId: "air-hockey", target: 2, label: "Win 2 matches of Air Hockey", coins: 40, xp: 35 },

  { id: "c_any_plays", type: "plays", gameId: null, target: 5, label: "Play 5 games (any games count)", coins: 40, xp: 30 },
  { id: "c_memory_plays", type: "plays", gameId: "memory-match", target: 3, label: "Complete 3 rounds of Memory Match", coins: 35, xp: 30 },
  { id: "c_sudoku_plays", type: "plays", gameId: "sudoku", target: 1, label: "Complete a Sudoku puzzle", coins: 50, xp: 45 },
  { id: "c_minesweeper_plays", type: "plays", gameId: "minesweeper", target: 2, label: "Clear 2 Minesweeper boards", coins: 45, xp: 40 },
  { id: "c_maze_plays", type: "plays", gameId: "maze-runner", target: 2, label: "Solve 2 mazes in Maze Runner", coins: 40, xp: 35 },
  { id: "c_word_plays", type: "plays", gameId: "word-scramble", target: 5, label: "Solve 5 words in Word Scramble", coins: 35, xp: 30 },

  { id: "c_playtime_5m", type: "playtime", gameId: null, target: 300, label: "Play for 5 minutes total", coins: 30, xp: 25 },
  { id: "c_playtime_15m", type: "playtime", gameId: null, target: 900, label: "Play for 15 minutes total", coins: 60, xp: 50 },
  { id: "c_survive_runner", type: "score", gameId: "endless-runner", target: 60, label: "Survive 60 seconds in Neon Runner", coins: 40, xp: 35, isTime: true },
  { id: "c_survive_space", type: "score", gameId: "space-shooter", target: 90, label: "Survive 90 seconds in Nova Strike", coins: 45, xp: 35, isTime: true },
];

export default CHALLENGE_POOL;
