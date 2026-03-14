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
    id:       'raceGame',
    title:    'מרוץ המכוניות',
    desc:     'נהג במכונית, הימנע ממכוניות, אסוף פריטי כוח והגע לקו הסיום!',
    icon:     '🏎️',
    btnColor: 'btn-blue',
    path:     '../raceGame/index.html',
    thumb:    '../raceGame/assets/thumb.png',
  },

  {
    id:       'multiplicationGame',
    title:    'לוח הכפל',
    desc:     'ענה על שאלות כפל, צבור ניקוד והתחרה בעצמך — 6 רמות קושי!',
    icon:     '✖️',
    btnColor: 'btn-purple',
    path:     '../multiplicationGame/index.html',
    thumb:    '../multiplicationGame/assets/thumb.png',
  },

  {
    id:       'pongGame',
    title:    'פינג פונג',
    desc:     'שחק פינג פונג נגד המחשב — בחר רמת קושי והגע ל-7 נקודות ראשון!',
    icon:     '🏓',
    btnColor: 'btn-cyan',
    path:     '../pongGame/index.html',
    thumb:    '../pongGame/assets/thumb.png',
  },

  {
    id:       'spaceGame',
    title:    'מגני החלל',
    desc:     'הגן על כדור הארץ מפני פלישת החייזרים — 3 רמות קושי, בוסים, ופריטי כוח!',
    icon:     '🚀',
    btnColor: 'btn-darkblue',
    path:     '../spaceGame/index.html',
    thumb:    '../spaceGame/assets/thumb.png',
  },

  {
    id:       'memoryGame',
    title:    'זיכרון קסום',
    desc:     'הפוך קלפים, מצא זוגות — 4 מצבי משחק, 3 נושאים ורמות קושי!',
    icon:     '🃏',
    btnColor: 'btn-pink',
    path:     '../memoryGame/index.html',
    thumb:    '../memoryGame/assets/thumb.png',
  },

  {
    id:       'colorCatcher',
    title:    'תופס צבעים',
    desc:     'תפוס רק את הצורות הנכונות — צבע, צורה, מספר, או מיקס! 4 מצבי משחק.',
    icon:     '🎨',
    btnColor: 'btn-green',
    path:     '../colorCatcher/index.html',
    thumb:    '../colorCatcher/assets/thumb.png',
  },

  {
    id:       'matchGame',
    title:    'כוכבי קסם',
    desc:     'החלף כוכבים וצור שורות של 3 ומעלה — 3 מצבי משחק, פצצות, קשתות ועוד!',
    icon:     '✨',
    btnColor: 'btn-yellow',
    path:     '../matchGame/index.html',
    thumb:    '../matchGame/assets/thumb.png',
  },

  {
    id:       'builderGame',
    title:    'בונה מגדלים',
    desc:     'הנח גושים, איזן מגדלים ובנה עד השמיים — 3 מצבי משחק ואתגרים!',
    icon:     '🏗️',
    btnColor: 'btn-orange',
    path:     '../builderGame/index.html',
    thumb:    '../builderGame/assets/thumb.png',
  },

  {
    id:       'kingTowerGame',
    title:    'מלך המגדלים',
    desc:     'הפל גושים בתזמון מושלם, בנה מגדל ענק וקבל בונוסי קומבו! 3 מצבים.',
    icon:     '👑',
    btnColor: 'btn-red',
    path:     '../kingTowerGame/index.html',
    thumb:    '../kingTowerGame/assets/thumb.png',
  },

  {
    id:       'whackMoleGame',
    title:    'הכה את החפרפרת',
    desc:     'חפרפרות צצות מהחורים — הכה אותן מהר לפני שייעלמו! 3 רמות קושי.',
    icon:     '<img src="../whackMoleGame/assets/moles/triple2.png" style="width:80px;height:80px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));" alt="mole"/>',
    btnColor: 'btn-green',
    path:     '../whackMoleGame/index.html',
    thumb:    '',
  },

  {
    id:       'dagMaluach',
    title:    'דג מלוח',
    desc:     'משחק תנועה לילדים — מוזיקה, עצור, ושופט חכם עם מצלמה!',
    icon:     '🐟',
    btnColor: 'btn-blue',
    path:     '../dagMaluach/index.html',
    thumb:    '../dagMaluach/assets/logo.png',
  },

  // ── Add more games below ─────────────────────────────
  // {
  //   id:       'myNewGame',
  //   title:    'שם המשחק',
  //   desc:     'תיאור קצר של המשחק',
  //   icon:     '🎮',
  //   btnColor: 'btn-purple',
  //   path:     '../myNewGame/index.html',
  //   thumb:    '',
  // },
];
