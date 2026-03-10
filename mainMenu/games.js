// ═══════════════════════════════════════════════════════
//  GAMES LIST — add a new entry here for each new game
//  Fields:
//    id        - unique key
//    title     - Hebrew name shown on the card
//    desc      - short Hebrew description
//    icon      - emoji icon for the card
//    color     - gradient for the card background
//    path      - relative path from mainMenu/ to the game's index.html
// ═══════════════════════════════════════════════════════
const GAMES = [
  {
    id:    'raceGame',
    title: 'מרוץ המכוניות',
    desc:  'נהג במכונית, הימנע ממכוניות, אסוף פריטי כוח והגע לקו הסיום!',
    icon:  '🏎️',
    color: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
    path:  '../raceGame/index.html',
  },

  // ── Add more games below ─────────────────────────────
  // {
  //   id:    'myNewGame',
  //   title: 'שם המשחק',
  //   desc:  'תיאור קצר של המשחק',
  //   icon:  '🎮',
  //   color: 'linear-gradient(135deg, #2d6a4f, #40916c)',
  //   path:  '../myNewGame/index.html',
  // },
];
