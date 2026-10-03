// ============================================================
// App.jsx —— React 外壳：菜单 / HUD / 升级三选一 / 暂停 / 结算
// 游戏本体跑在 engine.js 的 Canvas 里，React 只做 UI 覆盖层
// ============================================================
import { useEffect, useRef, useState, useCallback } from 'react';
import { Game, fmtTime } from './game/engine.js';
import { unlockAudio, sfx } from './game/audio.js';
import './index.css';

const WEAPON_NAMES = { '🔫': '飞弹', '🪓': '飞斧', '⚡': '落雷' };

function Hud({ hud }) {
  if (!hud) return null;
  const hpPct = Math.max(0, (hud.hp / hud.maxHp) * 100);
  const xpPct = Math.min(100, (hud.xp / hud.xpNeed) * 100);
  return (
    <div className="hud">
      <div className="hud-left">
        <div className="bar hp"><div className="fill" style={{ width: hpPct + '%' }} /><span>{hud.hp}/{hud.maxHp}</span></div>
        <div className="bar xp"><div className="fill" style={{ width: xpPct + '%' }} /></div>
        <div className="weapons">
          {hud.weapons.map((w, i) => (
            <span key={i} className="wslot" title={WEAPON_NAMES[w.icon] || ''}>{w.icon}</span>
          ))}
        </div>
      </div>
      <div className="hud-mid"><span className="timer">{fmtTime(hud.time)}</span></div>
      <div className="hud-right">
        <span className="lvl">Lv.{hud.level}</span>
        <span>💀 {hud.kills}</span>
        <span>🪙 {hud.coins}</span>
      </div>
    </div>
  );
}

function LevelUpModal({ choices, onPick }) {
  return (
    <div className="overlay">
      <div className="panel">
        <h2>⬆️ 升级！三选一</h2>
        <div className="cards">
          {choices.map((c) => (
            <button key={c.id} className="ucard" onClick={() => onPick(c)}>
              <div className="uicon">{c.icon}</div>
              <div className="uname">{c.name}{c.lv > 0 && <span className="ulv"> Lv.{c.lv}</span>}</div>
              <div className="udesc">{c.desc(c.lv)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function EndScreen({ title, stats, onRestart, win }) {
  return (
    <div className="overlay">
      <div className="panel">
        <h2>{win ? '🏆 胜利！' : '💀 游戏结束'}</h2>
        <p className="endsub">{title}</p>
        <div className="stats">
          <div><span>⏱️ 存活时间</span><b>{fmtTime(stats.time)}</b></div>
          <div><span>💀 击杀数</span><b>{stats.kills}</b></div>
          <div><span>⬆️ 等级</span><b>{stats.level}</b></div>
          <div><span>🪙 金币</span><b>{stats.coins}</b></div>
        </div>
        <button className="bigbtn" onClick={onRestart}>🔄 再来一局</button>
      </div>
    </div>
  );
}

// 虚拟摇杆（触屏）
function Joystick({ gameRef }) {
  const zoneRef = useRef(null);
  const [knob, setKnob] = useState(null); // {dx, dy} -1..1
  const baseRef = useRef(null);

  const handle = useCallback((e) => {
    const game = gameRef.current;
    if (!game || !baseRef.current) return;
    const t = e.touches[0];
    const r = baseRef.current.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = (t.clientX - cx) / (r.width / 2);
    let dy = (t.clientY - cy) / (r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setKnob({ dx, dy });
    game.setJoystick(dx, dy);
  }, [gameRef]);

  const end = useCallback(() => {
    setKnob(null);
    gameRef.current?.setJoystick(0, 0);
  }, [gameRef]);

  return (
    <div
      className="joyzone"
      onTouchStart={(e) => { e.preventDefault(); handle(e); }}
      onTouchMove={(e) => { e.preventDefault(); handle(e); }}
      onTouchEnd={end}
      onTouchCancel={end}
    >
      <div className="joybase" ref={baseRef}>
        {knob && <div className="joyknob" style={{ transform: `translate(${knob.dx * 34}px, ${knob.dy * 34}px)` }} />}
      </div>
    </div>
  );
}

export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const [screen, setScreen] = useState('menu'); // menu | playing | paused
  const [hud, setHud] = useState(null);
  const [choices, setChoices] = useState(null);
  const [endStats, setEndStats] = useState(null);
  const [endKind, setEndKind] = useState(null); // over | win
  const [isTouch] = useState(() => 'ontouchstart' in window);

  const startGame = useCallback(() => {
    unlockAudio();
    const canvas = canvasRef.current;
    if (gameRef.current) gameRef.current.destroy();
    const game = new Game(canvas, {
      onHud: (h) => setHud(h),
      onLevelUp: (c) => setChoices(c),
      onGameOver: (s) => { setEndStats(s); setEndKind('over'); },
      onVictory: (s) => { setEndStats(s); setEndKind('win'); },
    });
    gameRef.current = game;
    setChoices(null);
    setEndStats(null);
    setEndKind(null);
    setScreen('playing');
    // 等一帧让 canvas 布局好再 start（resize 依赖 getBoundingClientRect）
    requestAnimationFrame(() => game.start());
  }, []);

  useEffect(() => {
    return () => gameRef.current?.destroy();
  }, []);

  const pick = (c) => {
    setChoices(null);
    // 下一帧再恢复，避免 React 状态和引擎暂停时序打架
    requestAnimationFrame(() => gameRef.current?.pickUpgrade(c));
  };

  const togglePause = () => {
    const g = gameRef.current;
    if (!g) return;
    g.togglePause();
    setScreen(g.paused ? 'paused' : 'playing');
  };

  const playing = screen === 'playing' || screen === 'paused';

  return (
    <div className="wrap">
      <canvas ref={canvasRef} className="game" />

      {screen === 'menu' && (
        <div className="overlay">
          <div className="panel menu">
            <h1>⚔️ 像素幸存者</h1>
            <p className="endsub">Pixel Survivor · 活下去就是胜利</p>
            <div className="howto">
              <p>🕹️ {isTouch ? '左侧虚拟摇杆走位' : 'WASD / 方向键走位'}</p>
              <p>🔫 武器自动攻击最近的敌人</p>
              <p>💎 捡宝石升级，活过 <b>10:00</b> 即胜利！</p>
              <p>🦇 蝙蝠 / 💀 骷髅 / 🟢 史莱姆，小心每分钟的精英怪</p>
            </div>
            <button className="bigbtn" onClick={startGame}>▶ 开始游戏</button>
          </div>
        </div>
      )}

      {playing && <Hud hud={hud} />}
      {playing && (
        <button className="pausebtn" onClick={togglePause} aria-label="暂停">
          {screen === 'paused' ? '▶' : '⏸'}
        </button>
      )}
      {isTouch && playing && <Joystick gameRef={gameRef} />}

      {screen === 'paused' && !choices && !endStats && (
        <div className="overlay">
          <div className="panel">
            <h2>⏸ 已暂停</h2>
            <button className="bigbtn" onClick={togglePause}>▶ 继续</button>
            <button className="ghostbtn" onClick={startGame}>🔄 重新开始</button>
          </div>
        </div>
      )}

      {choices && <LevelUpModal choices={choices} onPick={pick} />}

      {endStats && (
        <EndScreen
          title={endKind === 'win' ? '你活过了 10 分钟，真正的幸存者！' : '怪物们把你包围了……'}
          stats={endStats}
          win={endKind === 'win'}
          onRestart={startGame}
        />
      )}
    </div>
  );
}
