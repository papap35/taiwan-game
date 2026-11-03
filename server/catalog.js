// 遊戲、兌換商品、成就的靜態設定。前端也會透過 /api/catalog 取得。

export const STARTING_TOKENS = 100;
export const DAILY_CHECKIN_BASE = 30;
export const DAILY_CHECKIN_STREAK_BONUS = 5; // 每連續一天多 5，最多 7 天
export const GIFT_DAILY_LIMIT = 200;

/**
 * cost: 每局花費代幣
 * maxTickets: 單局最多可得彩票（伺服器端上限，防作弊）
 * minSeconds: 一局最短秒數（太快結束視為異常）
 * ticketsFor(score): 分數換算彩票
 */
export const GAMES = {
  'coin-pusher': {
    id: 'coin-pusher',
    name: '推金幣',
    desc: '投下金幣，讓推台把金幣推落！掉進前方出口的金幣都換成彩票。',
    cost: 10,
    maxTickets: 200,
    minSeconds: 5,
    ticketsFor: (score) => Math.floor(score * 4),
  },
  pinball: {
    id: 'pinball',
    name: '彈珠台',
    desc: '用左右擋板守住彈珠，撞擊彈跳柱與目標拿高分。三顆球定勝負！',
    cost: 5,
    maxTickets: 150,
    minSeconds: 8,
    ticketsFor: (score) => Math.floor(score / 500),
  },
  claw: {
    id: 'claw',
    name: '夾娃娃機',
    desc: '移動夾子，對準娃娃按下夾取。夾到的娃娃可換大量彩票！',
    cost: 10,
    maxTickets: 120,
    minSeconds: 3,
    ticketsFor: (score) => score * 60 + 3,
  },
  whack: {
    id: 'whack',
    name: '打地鼠',
    desc: '30 秒內盡可能敲打冒出的地鼠，金色地鼠加倍，小心炸彈！',
    cost: 5,
    maxTickets: 120,
    minSeconds: 25,
    ticketsFor: (score) => Math.floor(score / 10),
  },
  basketball: {
    id: 'basketball',
    name: '投籃機',
    desc: '拖曳滑鼠或手指往上甩出籃球！最後 10 秒得分加倍。',
    cost: 5,
    maxTickets: 120,
    minSeconds: 30,
    ticketsFor: (score) => Math.floor(score / 2),
  },
  marie: {
    id: 'marie',
    name: '小瑪莉',
    desc: '經典水果盤！押注水果、按下開始，燈停在哪就贏哪。結算時剩餘點數換成彩票。',
    cost: 10,
    maxTickets: 200,
    minSeconds: 3,
    ticketsFor: (score) => Math.floor(score),
  },
};

export const RARITY = {
  common: { name: '普通', color: '#9aa5b1' },
  rare: { name: '稀有', color: '#4ea8ff' },
  epic: { name: '史詩', color: '#c26dff' },
  legendary: { name: '傳說', color: '#ffb020' },
};

/**
 * type:
 *  badge  數位徽章（可展示在個人檔案）
 *  hat    角色帽子（遊戲場中顯示）
 *  color  角色衣服顏色
 *  tokens 兌換代幣（grant 為獲得的代幣數）
 * price 以彩票計價
 */
export const SHOP_ITEMS = [
  { id: 'tokens-50', type: 'tokens', name: '50 代幣', icon: '🪙', price: 300, grant: 50, rarity: 'common', repeatable: true, desc: '用彩票換回代幣，繼續玩！' },
  { id: 'tokens-200', type: 'tokens', name: '200 代幣', icon: '💰', price: 1100, grant: 200, rarity: 'rare', repeatable: true, desc: '大包代幣，划算 9 折。' },

  { id: 'badge-boba', type: 'badge', name: '珍珠奶茶', icon: '🧋', price: 150, rarity: 'common', desc: '台灣之光，人手一杯。' },
  { id: 'badge-lantern', type: 'badge', name: '天燈', icon: '🏮', price: 200, rarity: 'common', desc: '平溪天燈，許個願吧。' },
  { id: 'badge-chicken', type: 'badge', name: '鹽酥雞', icon: '🍗', price: 250, rarity: 'common', desc: '宵夜場必備。' },
  { id: 'badge-scooter', type: 'badge', name: '機車大隊', icon: '🛵', price: 400, rarity: 'rare', desc: '待轉區等紅燈的日常。' },
  { id: 'badge-temple', type: 'badge', name: '廟口', icon: '⛩️', price: 500, rarity: 'rare', desc: '廟口夜市，童年回憶。' },
  { id: 'badge-mountain', type: 'badge', name: '玉山', icon: '🏔️', price: 800, rarity: 'epic', desc: '東北亞第一高峰。' },
  { id: 'badge-taipei101', type: 'badge', name: '台北 101', icon: '🗼', price: 1200, rarity: 'epic', desc: '跨年煙火最閃亮。' },
  { id: 'badge-dragon', type: 'badge', name: '金龍', icon: '🐉', price: 3000, rarity: 'legendary', desc: '遊樂場傳說級玩家的象徵。' },

  { id: 'hat-cap', type: 'hat', name: '鴨舌帽', icon: '🧢', price: 200, rarity: 'common', desc: '戴上去就是街機少年。', value: 'cap' },
  { id: 'hat-bamboo', type: 'hat', name: '斗笠', icon: '👒', price: 350, rarity: 'rare', desc: '農村風情。', value: 'bamboo' },
  { id: 'hat-crown', type: 'hat', name: '皇冠', icon: '👑', price: 1500, rarity: 'epic', desc: '遊戲場之王。', value: 'crown' },

  { id: 'color-red', type: 'color', name: '紅色上衣', icon: '🟥', price: 100, rarity: 'common', value: '#e84a5f', desc: '喜氣洋洋。' },
  { id: 'color-green', type: 'color', name: '綠色上衣', icon: '🟩', price: 100, rarity: 'common', value: '#3ec46d', desc: '清新自然。' },
  { id: 'color-purple', type: 'color', name: '紫色上衣', icon: '🟪', price: 150, rarity: 'rare', value: '#9b5de5', desc: '神秘高貴。' },
  { id: 'color-gold', type: 'color', name: '金色上衣', icon: '🟨', price: 600, rarity: 'epic', value: '#ffcc33', desc: '閃閃發光。' },
];

export const DEFAULT_COLOR = '#3d7bfd';

/** 成就：check(stats) 回傳是否達成。reward 為代幣獎勵。badge 為成就專屬徽章。 */
export const ACHIEVEMENTS = [
  { id: 'first-play', name: '初來乍到', icon: '🎮', desc: '玩第一場遊戲', reward: 20, check: (s) => s.plays >= 1 },
  { id: 'all-games', name: '全制霸', icon: '🗺️', desc: '每一款遊戲都玩過', reward: 100, check: (s) => s.distinctGames >= Object.keys(GAMES).length },
  { id: 'plays-50', name: '街機老手', icon: '🕹️', desc: '累積玩 50 場', reward: 150, check: (s) => s.plays >= 50 },
  { id: 'tickets-1000', name: '彩票收藏家', icon: '🎟️', desc: '累積獲得 1000 張彩票', reward: 100, check: (s) => s.ticketsEarned >= 1000 },
  { id: 'tickets-10000', name: '彩票大亨', icon: '🏆', desc: '累積獲得 10000 張彩票', reward: 500, check: (s) => s.ticketsEarned >= 10000 },
  { id: 'claw-win', name: '夾娃娃高手', icon: '🧸', desc: '成功夾到一隻娃娃', reward: 50, check: (s) => s.clawWins >= 1 },
  { id: 'pinball-20k', name: '彈珠達人', icon: '⚪', desc: '彈珠台單局 20000 分', reward: 80, check: (s) => (s.best.pinball || 0) >= 20000 },
  { id: 'whack-300', name: '地鼠剋星', icon: '🔨', desc: '打地鼠單局 300 分', reward: 80, check: (s) => (s.best.whack || 0) >= 300 },
  { id: 'hoops-60', name: '神射手', icon: '🏀', desc: '投籃機單局 60 分', reward: 80, check: (s) => (s.best.basketball || 0) >= 60 },
  { id: 'friend-1', name: '交個朋友', icon: '🤝', desc: '擁有第一位好友', reward: 30, check: (s) => s.friends >= 1 },
  { id: 'group-1', name: '揪團出遊', icon: '👥', desc: '加入一個群組', reward: 30, check: (s) => s.groups >= 1 },
  { id: 'checkin-7', name: '天天報到', icon: '📅', desc: '連續簽到 7 天', reward: 100, check: (s) => s.streak >= 7 },
  { id: 'collector-5', name: '徽章收藏家', icon: '🎖️', desc: '收集 5 枚徽章', reward: 100, check: (s) => s.badges >= 5 },
];

export function publicCatalog() {
  return {
    games: Object.values(GAMES).map(({ ticketsFor, ...g }) => g),
    shop: SHOP_ITEMS,
    rarity: RARITY,
    achievements: ACHIEVEMENTS.map(({ check, ...a }) => a),
    economy: {
      startingTokens: STARTING_TOKENS,
      dailyBase: DAILY_CHECKIN_BASE,
      dailyStreakBonus: DAILY_CHECKIN_STREAK_BONUS,
      giftDailyLimit: GIFT_DAILY_LIMIT,
    },
  };
}
