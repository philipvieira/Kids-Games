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
    thumb: '../raceGame/assets/thumb.png',
  },

  {
    id:    'multiplicationGame',
    title: 'לוח הכפל',
    desc:  'ענה על שאלות כפל, צבור ניקוד והתחרה בעצמך — 6 רמות קושי!',
    icon:  '✖️',
    color: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    path:  '../multiplicationGame/index.html',
    thumb: '../multiplicationGame/assets/thumb.png',
  },

  {
    id:    'pongGame',
    title: 'פינג פונג',
    desc:  'שחק פינג פונג נגד המחשב — בחר רמת קושי והגע ל-7 נקודות ראשון!',
    icon:  '🏓',
    color: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
    path:  '../pongGame/index.html',
    thumb: '../pongGame/assets/thumb.png',
  },

  {
    id:    'spaceGame',
    title: 'מגני החלל',
    desc:  'הגן על כדור הארץ מפני פלישת החייזרים — 3 רמות קושי, בוסים, ופריטי כוח!',
    icon:  '🚀',
    color: 'linear-gradient(135deg, #05070f 0%, #0d1b2a 50%, #1a0533 100%)',
    path:  '../spaceGame/index.html',
    thumb: '../spaceGame/assets/thumb.png',
  },

  {
    id:    'memoryGame',
    title: 'זיכרון קסום',
    desc:  'הפוך קלפים, מצא זוגות — 4 מצבי משחק, 3 נושאים ורמות קושי!',
    icon:  '🃏',
    color: 'linear-gradient(135deg, #1a1a2e 0%, #3a0ca3 50%, #7209b7 100%)',
    path:  '../memoryGame/index.html',
    thumb: '../memoryGame/assets/thumb.png',
  },

  {
    id:    'colorCatcher',
    title: 'תופס צבעים',
    desc:  'תפוס רק את הצורות הנכונות — צבע, צורה, מספר, או מיקס! 4 מצבי משחק.',
    icon:  '🎨',
    color: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
    path:  '../colorCatcher/index.html',
    thumb: '../colorCatcher/assets/thumb.png',
  },

  {
    id:    'matchGame',
    title: 'כוכבי קסם',
    desc:  'החלף כוכבים וצור שורות של 3 ומעלה — 3 מצבי משחק, פצצות, קשתות ועוד!',
    icon:  '✨',
    color: 'linear-gradient(135deg, #1a1040 0%, #2d1b69 50%, #4c1d95 100%)',
    path:  '../matchGame/index.html',
    thumb: '../matchGame/assets/thumb.png',
  },

  {
    id:    'builderGame',
    title: 'בונה מגדלים',
    desc:  'הנח גושים, איזן מגדלים ובנה עד השמיים — 3 מצבי משחק ואתגרים!',
    icon:  '🏗️',
    color: 'linear-gradient(135deg, #1a6ba0 0%, #2a9fd4 50%, #87ceeb 100%)',
    path:  '../builderGame/index.html',
    thumb: '../builderGame/assets/thumb.png',
  },

  {
    id:    'kingTowerGame',
    title: 'מלך המגדלים',
    desc:  'הפל גושים בתזמון מושלם, בנה מגדל ענק וקבל בונוסי קומבו! 3 מצבים.',
    icon:  '👑',
    color: 'linear-gradient(135deg, #0d1b3e 0%, #1a4a8a 50%, #ffe14d 100%)',
    path:  '../kingTowerGame/index.html',
    thumb: '',
  },

  {
    id:    'whackMoleGame',
    title: 'הכה את החפרפרת',
    desc:  'חפרפרות צצות מהחורים — הכה אותן מהר לפני שייעלמו! 3 רמות קושי.',
    icon:  '<img src="../whackMoleGame/assets/moles/triple2.png" style="width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));" alt="mole"/>',
    color: 'linear-gradient(135deg, #2d6a18 0%, #56ab2f 50%, #a8e063 100%)',
    path:  '../whackMoleGame/index.html',
    thumb: '',
  },

  {
    id:    'dagMaluach',
    title: 'דג מלוח',
    desc:  'משחק תנועה לילדים — מוזיקה, עצור, ושופט חכם עם מצלמה!',
    icon:  '🐟',
    color: 'linear-gradient(135deg, #0d1b4b 0%, #1a3a8f 50%, #48cae4 100%)',
    path:  '../dagMaluach/index.html',
    thumb: '../dagMaluach/assets/logo.png',
  },

  // ── Add more games below ─────────────────────────────
  // To add a screenshot: set thumb: '../myGame/assets/thumb.png'
  // {
  //   id:    'myNewGame',
  //   title: 'שם המשחק',
  //   desc:  'תיאור קצר של המשחק',
  //   icon:  '🎮',
  //   color: 'linear-gradient(135deg, #2d6a4f, #40916c)',
  //   path:  '../myNewGame/index.html',
  //   thumb: '',
  // },
];
