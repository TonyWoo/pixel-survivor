// ============================================================
// engine.js —— 游戏引擎：状态、主循环、碰撞、渲染
// Canvas 2D，全部像素风手绘。React 只负责 UI 覆盖层。
// 数值设计：前 2 分钟轻松，5 分钟有压力，10 分钟胜利结算。
// ============================================================
import { SPR, drawSprite } from './sprites.js';
import { sfx } from './audio.js';
import { rollUpgrades, applyUpgrade } from './upgrades.js';

const TAU = Math.PI * 2;
const WIN_TIME = 600; // 10 分钟胜利

// 敌人配置：蝙蝠快血少 / 骷髅均衡 / 史莱姆慢血厚
const ENEMY_TYPES = {
  bat:      { hp: 10, speed: 135, dmg: 8,  xp: 1, r: 13, scale: 3 },
  skeleton: { hp: 24, speed: 88,  dmg: 12, xp: 2, r: 14, scale: 3 },
  slime:    { hp: 48, speed: 58,  dmg: 15, xp: 3, r: 17, scale: 3 },
};

function rand(a, b) { return a + Math.random() * (b - a); }
function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
// 格子哈希：草地装饰用，确定性伪随机
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

function xpNext(level) {
  return Math.floor(6 + level * level * 1.6);
}

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.hooks = hooks; // { onHud, onLevelUp, onGameOver, onVictory }
    this.keys = new Set();
    this.joy = { x: 0, y: 0 }; // 触屏摇杆向量
    this.hudTimer = 0;
    this.animT = 0;
    this.reset();
    this.resize();
    this._onKeyDown = (e) => { this.keys.add(e.code); if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault(); };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onResize = () => this.resize();
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('resize', this._onResize);
  }

  reset() {
    this.player = {
      x: 0, y: 0, hp: 100, maxHp: 100, speed: 235,
      damage: 12, fireRate: 1.1, pierce: 0, regen: 0,
      level: 1, xp: 0, xpNeed: xpNext(1),
      weapons: {}, upLv: {}, fireTimer: 0.4,
    };
    this.enemies = [];
    this.projectiles = [];
    this.gems = [];
    this.coins = [];
    this.particles = [];
    this.floaters = [];
    this.strikes = [];
    this.time = 0;
    this.kills = 0;
    this.coinCount = 0;
    this.spawnTimer = 1.2;
    this.nextEliteAt = 60;
    this.pendingLevels = 0;
    this.paused = false;
    this.over = false;
    this.won = false;
    this.camera = { x: 0, y: 0 };
    this.last = 0;
    this.raf = 0;
  }

  // ---- 输入 ----
  setJoystick(x, y) { this.joy.x = x; this.joy.y = y; }

  moveVec() {
    let x = 0, y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    x += this.joy.x; y += this.joy.y;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.floor(r.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(r.height * dpr));
    this.dpr = dpr;
  }

  start() {
    this.reset();
    this.last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused && !this.over && !this.won) this.update(dt);
      this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('resize', this._onResize);
  }

  togglePause() {
    if (this.over || this.won || this.pendingLevels > 0) return;
    this.paused = !this.paused;
    this.hooks.onHud(this.hud());
  }

  // ---- 升级 ----
  gainXp(v) {
    const p = this.player;
    p.xp += v;
    while (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level += 1;
      p.xpNeed = xpNext(p.level);
      this.pendingLevels += 1;
    }
    if (this.pendingLevels > 0 && !this.paused) {
      this.paused = true;
      sfx.levelup();
      this.hooks.onLevelUp(rollUpgrades(p));
    }
  }

  pickUpgrade(up) {
    applyUpgrade(this.player, up);
    sfx.select();
    this.pendingLevels -= 1;
    if (this.pendingLevels > 0) {
      this.hooks.onLevelUp(rollUpgrades(this.player));
    } else {
      this.paused = false;
    }
    this.hooks.onHud(this.hud());
  }

  // ---- 刷怪 ----
  spawnInterval() {
    return Math.max(0.28, 1.1 - this.time * 0.0016);
  }
  hpMult() { return 1 + (this.time / 60) * 0.45; }
  spdMult() { return 1 + (this.time / 600) * 0.35; }

  pickType() {
    const t = this.time;
    const r = Math.random();
    if (t > 150 && r < 0.25) return 'slime';
    if (t > 60 && r < 0.55) return 'skeleton';
    return 'bat';
  }

  spawnEnemy(forceType, elite) {
    const type = forceType || this.pickType();
    const cfg = ENEMY_TYPES[type];
    // 屏幕边缘外刷怪
    const w = this.canvas.width / this.dpr, h = this.canvas.height / this.dpr;
    const cx = this.camera.x, cy = this.camera.y;
    const side = Math.floor(Math.random() * 4);
    const m = 60;
    let x, y;
    if (side === 0) { x = cx - w / 2 - m; y = rand(cy - h / 2, cy + h / 2); }
    else if (side === 1) { x = cx + w / 2 + m; y = rand(cy - h / 2, cy + h / 2); }
    else if (side === 2) { x = rand(cx - w / 2, cx + w / 2); y = cy - h / 2 - m; }
    else { x = rand(cx - w / 2, cx + w / 2); y = cy + h / 2 + m; }
    const em = elite ? 8 : 1;
    this.enemies.push({
      type, x, y,
      hp: cfg.hp * this.hpMult() * em,
      maxHp: cfg.hp * this.hpMult() * em,
      speed: cfg.speed * this.spdMult() * rand(0.9, 1.1),
      dmg: Math.round(cfg.dmg * (1 + this.time / 240) * (elite ? 2 : 1)),
      xp: cfg.xp * (elite ? 6 : 1),
      r: cfg.r * (elite ? 1.7 : 1),
      scale: cfg.scale * (elite ? 1.7 : 1),
      elite: !!elite,
      flash: 0, touchCd: 0, axeCd: 0,
      wob: Math.random() * TAU,
    });
  }

  // ---- 伤害 ----
  damageEnemy(e, dmg, kx = 0, ky = 0) {
    e.hp -= dmg;
    e.flash = 0.09;
    e.x += kx; e.y += ky;
    this.floaters.push({ x: e.x + rand(-8, 8), y: e.y - e.r - 6, text: Math.round(dmg), life: 0.7, max: 0.7, color: '#fde047' });
    sfx.hit();
    if (e.hp <= 0 && !e.dead) {
      e.dead = true;
      this.kills += 1;
      sfx.kill();
      // 死亡粒子
      const col = e.type === 'bat' ? '#9b5de5' : e.type === 'skeleton' ? '#e8e8e8' : '#4ade80';
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * TAU, sp = rand(40, 160);
        this.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.3, 0.6), max: 0.6, color: col, size: rand(2, 5) });
      }
      // 掉落宝石 + 金币
      const n = e.elite ? 8 : 1;
      for (let i = 0; i < n; i++) {
        this.gems.push({ x: e.x + rand(-14, 14), y: e.y + rand(-14, 14), v: e.xp, vx: rand(-60, 60), vy: rand(-60, 60) });
      }
      const cn = e.elite ? 5 : (Math.random() < 0.35 ? 1 : 0);
      for (let i = 0; i < cn; i++) {
        this.coins.push({ x: e.x + rand(-16, 16), y: e.y + rand(-16, 16), v: 1, vx: rand(-70, 70), vy: rand(-70, 70) });
      }
    }
  }

  nearestEnemy(x, y, maxD) {
    let best = null, bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ---- 主更新 ----
  update(dt) {
    this.animT += dt;
    const p = this.player;
    this.time += dt;

    // 胜利：10 分钟
    if (this.time >= WIN_TIME) {
      this.won = true;
      sfx.win();
      this.hooks.onVictory(this.stats());
      return;
    }

    // 移动
    const mv = this.moveVec();
    p.x += mv.x * p.speed * dt;
    p.y += mv.y * p.speed * dt;
    // 回血
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    // 飞弹：自动射向最近的敌人
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) {
      const tgt = this.nearestEnemy(p.x, p.y, 480);
      if (tgt) {
        p.fireTimer = 1 / p.fireRate;
        const a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
        this.projectiles.push({
          x: p.x, y: p.y - 10, vx: Math.cos(a) * 540, vy: Math.sin(a) * 540,
          dmg: p.damage, pierce: p.pierce, life: 1.1,
        });
        sfx.shoot();
      } else {
        p.fireTimer = 0.15;
      }
    }

    // 环绕飞斧
    const axe = p.weapons.axe;
    if (axe) {
      axe.angle += axe.speed * dt;
      for (let i = 0; i < axe.count; i++) {
        const a = axe.angle + (i * TAU) / axe.count;
        const ax = p.x + Math.cos(a) * axe.radius;
        const ay = p.y + Math.sin(a) * axe.radius;
        for (const e of this.enemies) {
          if (e.dead || e.axeCd > 0) continue;
          if (dist2(ax, ay, e.x, e.y) < (e.r + 16) * (e.r + 16)) {
            e.axeCd = 0.35;
            this.damageEnemy(e, axe.damage, Math.cos(a) * 26, Math.sin(a) * 26);
          }
        }
      }
    }

    // 落雷
    const li = p.weapons.lightning;
    if (li) {
      li.timer -= dt;
      if (li.timer <= 0) {
        li.timer = li.interval;
        const cands = this.enemies.filter((e) => !e.dead).sort((a, b) =>
          dist2(p.x, p.y, a.x, a.y) - dist2(p.x, p.y, b.x, b.y)).slice(0, li.count);
        if (cands.length) sfx.thunder();
        for (const e of cands) {
          this.strikes.push({ x: e.x, y: e.y, life: 0.28, max: 0.28, seed: Math.random() * 100 });
          this.damageEnemy(e, li.damage);
          for (let i = 0; i < 6; i++) {
            this.particles.push({ x: e.x, y: e.y, vx: rand(-120, 120), vy: rand(-160, 40), life: 0.4, max: 0.4, color: '#fef08a', size: rand(2, 4) });
          }
        }
      }
    }

    // 刷怪
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.spawnInterval();
      const batch = 1 + Math.floor(this.time / 90);
      const n = Math.min(batch, 6);
      for (let i = 0; i < n && this.enemies.length < 150; i++) this.spawnEnemy();
    }
    // 精英怪每 60 秒
    if (this.time >= this.nextEliteAt) {
      this.nextEliteAt += 60;
      this.spawnEnemy(null, true);
      this.floaters.push({ x: p.x, y: p.y - 60, text: '⚠ 精英怪出现！', life: 1.6, max: 1.6, color: '#f87171' });
    }

    // 敌人：追踪 + 接触伤害 + 简单分离
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.wob += dt * 6;
      e.flash = Math.max(0, e.flash - dt);
      e.touchCd = Math.max(0, e.touchCd - dt);
      e.axeCd = Math.max(0, e.axeCd - dt);
      const a = Math.atan2(p.y - e.y, p.x - e.x);
      e.x += Math.cos(a) * e.speed * dt;
      e.y += Math.sin(a) * e.speed * dt;
      const d = Math.hypot(p.x - e.x, p.y - e.y);
      if (d < e.r + 14 && e.touchCd <= 0) {
        e.touchCd = 0.6;
        p.hp -= e.dmg;
        sfx.hurt();
        this.floaters.push({ x: p.x, y: p.y - 30, text: '-' + e.dmg, life: 0.8, max: 0.8, color: '#f87171' });
        // 受伤粒子
        for (let i = 0; i < 5; i++) {
          this.particles.push({ x: p.x, y: p.y, vx: rand(-100, 100), vy: rand(-100, 100), life: 0.35, max: 0.35, color: '#e64545', size: 3 });
        }
        if (p.hp <= 0) {
          p.hp = 0;
          this.over = true;
          sfx.lose();
          this.hooks.onGameOver(this.stats());
          return;
        }
      }
    }
    // 分离（避免叠罗汉），O(n²)但上限150只可接受
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) {
      const a = es[i];
      if (a.dead) continue;
      for (let j = i + 1; j < es.length; j++) {
        const b = es[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < rr * rr) {
          const d = Math.sqrt(d2), push = ((rr - d) / d) * 0.5 * 60 * dt;
          a.x -= dx * push / 60; a.y -= dy * push / 60;
          b.x += dx * push / 60; b.y += dy * push / 60;
        }
      }
    }
    // 清理死亡
    if (es.some((e) => e.dead)) this.enemies = es.filter((e) => !e.dead);

    // 飞弹
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      for (const e of this.enemies) {
        if (e.dead || pr.hitSet?.has(e)) continue;
        if (dist2(pr.x, pr.y, e.x, e.y) < (e.r + 8) * (e.r + 8)) {
          (pr.hitSet ||= new Set()).add(e);
          const a = Math.atan2(pr.vy, pr.vx);
          this.damageEnemy(e, pr.dmg, Math.cos(a) * 22, Math.sin(a) * 22);
          pr.pierce -= 1;
          if (pr.pierce < 0) { pr.life = 0; break; }
        }
      }
    }
    this.projectiles = this.projectiles.filter((pr) => pr.life > 0);

    // 宝石/金币：磁吸 + 拾取
    const magnetR = 120;
    for (const gm of this.gems) {
      gm.x += gm.vx * dt; gm.y += gm.vy * dt;
      gm.vx *= 0.92; gm.vy *= 0.92;
      const d2 = dist2(gm.x, gm.y, p.x, p.y);
      if (d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = 900 * dt;
        gm.x += ((p.x - gm.x) / d) * pull;
        gm.y += ((p.y - gm.y) / d) * pull;
      }
      if (d2 < 24 * 24) { gm.got = true; sfx.pickup(); this.gainXp(gm.v); }
    }
    this.gems = this.gems.filter((g) => !g.got);
    for (const c of this.coins) {
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= 0.92; c.vy *= 0.92;
      const d2 = dist2(c.x, c.y, p.x, p.y);
      if (d2 < magnetR * magnetR) {
        const d = Math.sqrt(d2) || 1;
        const pull = 900 * dt;
        c.x += ((p.x - c.x) / d) * pull;
        c.y += ((p.y - c.y) / d) * pull;
      }
      if (d2 < 24 * 24) { c.got = true; this.coinCount += c.v; sfx.coin(); }
    }
    this.coins = this.coins.filter((c) => !c.got);

    // 粒子 / 飘字 / 落雷特效
    for (const pt of this.particles) { pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt; }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.floaters) { f.y -= 34 * dt; f.life -= dt; }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const s of this.strikes) s.life -= dt;
    this.strikes = this.strikes.filter((s) => s.life > 0);

    // 镜头跟随
    this.camera.x += (p.x - this.camera.x) * Math.min(1, dt * 6);
    this.camera.y += (p.y - this.camera.y) * Math.min(1, dt * 6);

    // HUD 节流推送
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.12;
      this.hooks.onHud(this.hud());
    }
  }

  stats() {
    const p = this.player;
    return { time: this.time, kills: this.kills, level: p.level, coins: this.coinCount };
  }

  hud() {
    const p = this.player;
    const weapons = [{ icon: '🔫' }];
    if (p.weapons.axe) weapons.push({ icon: '🪓' });
    if (p.weapons.lightning) weapons.push({ icon: '⚡' });
    return {
      hp: Math.ceil(p.hp), maxHp: p.maxHp,
      xp: Math.floor(p.xp), xpNeed: p.xpNeed,
      level: p.level, time: this.time, kills: this.kills, coins: this.coinCount,
      weapons, paused: this.paused,
    };
  }

  // ---- 渲染 ----
  render() {
    const g = this.g;
    const dpr = this.dpr;
    const W = this.canvas.width / dpr, H = this.canvas.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingEnabled = false;

    // 草地底
    g.fillStyle = '#2f8f3a';
    g.fillRect(0, 0, W, H);
    // 草叶装饰（镜头相关，确定性）
    const tile = 46;
    const x0 = Math.floor((this.camera.x - W / 2) / tile), x1 = Math.floor((this.camera.x + W / 2) / tile);
    const y0 = Math.floor((this.camera.y - H / 2) / tile), y1 = Math.floor((this.camera.y + H / 2) / tile);
    for (let tx = x0; tx <= x1; tx++) {
      for (let ty = y0; ty <= y1; ty++) {
        const hsh = hash2(tx, ty);
        if (hsh < 0.45) continue;
        const sx = tx * tile - this.camera.x + W / 2 + hsh * 30;
        const sy = ty * tile - this.camera.y + H / 2 + (hsh * 97 % 1) * 30;
        g.strokeStyle = hsh > 0.75 ? '#37a244' : '#278232';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(sx, sy); g.lineTo(sx + 3, sy - 7);
        g.moveTo(sx + 6, sy); g.lineTo(sx + 8, sy - 6);
        g.stroke();
      }
    }

    const px = (x) => x - this.camera.x + W / 2;
    const py = (y) => y - this.camera.y + H / 2;
    const inView = (x, y, m = 80) => x > this.camera.x - W / 2 - m && x < this.camera.x + W / 2 + m && y > this.camera.y - H / 2 - m && y < this.camera.y + H / 2 + m;

    // 金币 & 宝石
    const bob = Math.sin(this.animT * 5) * 2;
    for (const c of this.coins) {
      if (!inView(c.x, c.y)) continue;
      drawSprite(g, SPR.coin, px(c.x), py(c.y) + bob, 2.4);
    }
    for (const gm of this.gems) {
      if (!inView(gm.x, gm.y)) continue;
      drawSprite(g, SPR.gem, px(gm.x), py(gm.y) + bob, 2.6);
    }

    // 敌人
    for (const e of this.enemies) {
      if (!inView(e.x, e.y, 120)) continue;
      const frame = Math.floor(this.animT * 6 + e.wob) % 2;
      const img = e.type === 'bat' ? SPR.bat[frame] : e.type === 'slime' ? SPR.slime[frame] : SPR.skeleton;
      const sx = px(e.x), sy = py(e.y);
      // 阴影
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(sx, sy + e.r * 1.1, e.r * 0.9, e.r * 0.35, 0, 0, TAU); g.fill();
      drawSprite(g, img, sx, sy, e.scale, e.flash > 0);
      // 精英怪血条
      if (e.elite) {
        g.fillStyle = 'rgba(0,0,0,0.5)';
        g.fillRect(sx - 26, sy - e.r - 14, 52, 6);
        g.fillStyle = '#f87171';
        g.fillRect(sx - 26, sy - e.r - 14, 52 * Math.max(0, e.hp / e.maxHp), 6);
      }
    }

    // 玩家
    const p = this.player;
    {
      const sx = px(p.x), sy = py(p.y);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(sx, sy + 16, 16, 6, 0, 0, TAU); g.fill();
      // 受伤闪烁
      drawSprite(g, SPR.knight, sx, sy, 3);
    }

    // 环绕飞斧
    const axe = p.weapons.axe;
    if (axe) {
      for (let i = 0; i < axe.count; i++) {
        const a = axe.angle + (i * TAU) / axe.count;
        drawSprite(g, SPR.axe, px(p.x + Math.cos(a) * axe.radius), py(p.y + Math.sin(a) * axe.radius), 2.6);
      }
    }

    // 飞弹
    for (const pr of this.projectiles) {
      drawSprite(g, SPR.bolt, px(pr.x), py(pr.y), 2.6);
    }

    // 落雷
    for (const s of this.strikes) {
      const sx = px(s.x), sy = py(s.y);
      const alpha = s.life / s.max;
      g.save();
      g.globalAlpha = alpha;
      g.strokeStyle = '#fef9c3';
      g.lineWidth = 5;
      g.beginPath();
      let lx = sx, ly = sy - 260;
      g.moveTo(lx, ly);
      for (let i = 1; i <= 6; i++) {
        lx = sx + Math.sin(s.seed + i * 2.3) * 26 * (1 - i / 7);
        ly = sy - 260 + (260 * i) / 6;
        g.lineTo(lx, ly);
      }
      g.stroke();
      g.strokeStyle = '#facc15';
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    }

    // 粒子
    for (const pt of this.particles) {
      g.globalAlpha = Math.max(0, pt.life / pt.max);
      g.fillStyle = pt.color;
      g.fillRect(px(pt.x) - pt.size / 2, py(pt.y) - pt.size / 2, pt.size, pt.size);
    }
    g.globalAlpha = 1;

    // 伤害数字
    g.textAlign = 'center';
    g.font = 'bold 13px monospace';
    for (const f of this.floaters) {
      g.globalAlpha = Math.max(0, f.life / f.max);
      g.fillStyle = '#000';
      g.fillText(f.text, px(f.x) + 1, py(f.y) + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, px(f.x), py(f.y));
    }
    g.globalAlpha = 1;
  }
}

export function fmtTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
