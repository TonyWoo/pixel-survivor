// ============================================================
// upgrades.js —— 升级池：三选一的内容定义
// 每个升级有 id / 名称 / 图标 / 描述 / 最大等级 / 应用函数
// ============================================================

export const UPGRADES = [
  {
    id: 'dmg', name: '锋利飞弹', icon: '🗡️', max: 5,
    desc: (lv) => `飞弹伤害 +20%（当前 Lv.${lv}）`,
    apply: (p) => { p.damage *= 1.2; },
  },
  {
    id: 'rate', name: '连射', icon: '💨', max: 5,
    desc: (lv) => `攻击速度 +15%（当前 Lv.${lv}）`,
    apply: (p) => { p.fireRate *= 1.15; },
  },
  {
    id: 'speed', name: '疾风之靴', icon: '🥾', max: 5,
    desc: (lv) => `移动速度 +10%（当前 Lv.${lv}）`,
    apply: (p) => { p.speed *= 1.1; },
  },
  {
    id: 'hp', name: '生命精华', icon: '❤️', max: 5,
    desc: (lv) => `生命上限 +25，并回复 25（当前 Lv.${lv}）`,
    apply: (p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); },
  },
  {
    id: 'regen', name: '再生', icon: '💚', max: 5,
    desc: (lv) => `每秒回复 +0.8 生命（当前 Lv.${lv}）`,
    apply: (p) => { p.regen += 0.8; },
  },
  {
    id: 'pierce', name: '穿透', icon: '🏹', max: 4,
    desc: (lv) => `飞弹穿透 +1（当前 Lv.${lv}）`,
    apply: (p) => { p.pierce += 1; },
  },
  {
    id: 'axe', name: '环绕飞斧', icon: '🪓', max: 5,
    desc: (lv) => lv === 0 ? '解锁新武器：飞斧环绕自身旋转' : `飞斧伤害 +25%、数量 +1（当前 Lv.${lv}）`,
    apply: (p) => {
      if (!p.weapons.axe) p.weapons.axe = { count: 2, damage: 15, radius: 70, speed: 2.6, angle: 0 };
      else { const a = p.weapons.axe; a.count += 1; a.damage *= 1.25; }
    },
  },
  {
    id: 'bolt', name: '落雷', icon: '⚡', max: 5,
    desc: (lv) => lv === 0 ? '解锁新武器：定期召唤落雷轰击敌人' : `落雷伤害 +30%、间隔缩短（当前 Lv.${lv}）`,
    apply: (p) => {
      if (!p.weapons.lightning) p.weapons.lightning = { damage: 40, interval: 3.0, timer: 1.5, count: 3 };
      else { const l = p.weapons.lightning; l.damage *= 1.3; l.interval = Math.max(1.2, l.interval * 0.88); l.count += 1; }
    },
  },
];

// 从池子里随机抽 3 个未满级的升级
export function rollUpgrades(player) {
  const avail = UPGRADES.filter((u) => (player.upLv[u.id] || 0) < u.max);
  // 洗牌取前 3
  for (let i = avail.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [avail[i], avail[j]] = [avail[j], avail[i]];
  }
  return avail.slice(0, 3).map((u) => ({ ...u, lv: player.upLv[u.id] || 0 }));
}

// 应用升级
export function applyUpgrade(player, up) {
  up.apply(player);
  player.upLv[up.id] = (player.upLv[up.id] || 0) + 1;
}
