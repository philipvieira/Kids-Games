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

  {
    id:    'multiplicationGame',
    title: 'לוח הכפל',
    desc:  'ענה על שאלות כפל, צבור ניקוד והתחרה בעצמך — 6 רמות קושי!',
    icon:  '✖️',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    path:  '../multiplicationGame/index.html',
  },

  {
    id:    'pongGame',
    title: 'פינג פונג',
    desc:  'שחק פינג פונג נגד המחשב — בחר רמת קושי והגע ל-7 נקודות ראשון!',
    icon:  '🏓',
    color: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    path:  '../pongGame/index.html',
  },

  {
    id:    'spaceGame',
    title: 'מגני החלל',
    desc:  'הגן על כדור הארץ מפני פלישת החייזרים — 3 רמות קושי, בוסים, ופריטי כוח!',
    icon:  '🚀',
    color: 'linear-gradient(135deg, #05070f 0%, #0d1b2a 50%, #1a0533 100%)',
    path:  '../spaceGame/index.html',
  },

  {
    id:    'memoryGame',
    title: 'זיכרון קסום',
    desc:  'הפוך קלפים, מצא זוגות — 4 מצבי משחק, 3 נושאים ורמות קושי!',
    icon:  '🃏',
    color: 'linear-gradient(135deg, #1a1a2e 0%, #3a0ca3 50%, #7209b7 100%)',
    path:  '../memoryGame/index.html',
  },

  {
    id:    'colorCatcher',
    title: 'תופס צבעים',
    desc:  'תפוס רק את הצורות הנכונות — צבע, צורה, מספר, או מיקס! 4 מצבי משחק.',
    icon:  '🎨',
    color: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    path:  '../colorCatcher/index.html',
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
