// 極簡全域狀態 + 事件匯流排
const listeners = new Map();

export const store = {
  me: null,
  catalog: null,
  config: null,
  presence: new Map(), // userId -> online

  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event)?.delete(fn);
  },
  emit(event, data) {
    for (const fn of listeners.get(event) || []) fn(data);
  },
  setMe(me) {
    this.me = me;
    this.emit('me', me);
  },
  patchMe(patch) {
    this.me = { ...this.me, ...patch };
    this.emit('me', this.me);
  },
  game(id) {
    return this.catalog.games.find((g) => g.id === id);
  },
  item(id) {
    return this.catalog.shop.find((i) => i.id === id);
  },
  achievement(id) {
    return this.catalog.achievements.find((a) => a.id === id);
  },
  /** 徽章 id 可以是商店徽章或 ach:<成就id> */
  badge(id) {
    if (id?.startsWith('ach:')) {
      const a = this.achievement(id.slice(4));
      return a && { id, icon: a.icon, name: a.name, rarity: 'epic', desc: a.desc };
    }
    return this.item(id);
  },
};
