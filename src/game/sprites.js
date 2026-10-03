// ============================================================
// sprites.js —— 像素精灵：全部用字符串点阵手绘，零外部素材
// 每个精灵 = 字符画 + 调色板，渲染到离屏 canvas，放大时关闭平滑
// ============================================================

// 调色板（字符 -> 颜色，'.' = 透明）
const PAL = {
  K: '#1a1c2c', // 描边黑
  S: '#5d6b8c', // 钢甲灰蓝
  L: '#8fa3c8', // 钢甲高光
  F: '#ffd9a0', // 脸
  E: '#222222', // 眼睛
  R: '#e64545', // 红缨/红
  P: '#9b5de5', // 蝙蝠紫
  D: '#6d28a8', // 蝙蝠深紫
  W: '#e8e8e8', // 骨白
  G: '#8a8f98', // 骨灰
  M: '#4ade80', // 史莱姆绿
  N: '#16a34a', // 史莱姆深绿
  B: '#38bdf8', // 宝石蓝
  C: '#0ea5e9', // 宝石深蓝
  O: '#fbbf24', // 金币金
  Y: '#fef08a', // 金币高光
  A: '#a16207', // 斧柄棕
  T: '#d1d5db', // 斧刃银
  U: '#fef9c3', // 飞弹亮黄
  V: '#facc15', // 飞弹黄
};

// 16x16 小骑士
const KNIGHT = [
  '................',
  '......RRRR......',
  '.....RRRRRR.....',
  '.....KKKKKK.....',
  '....KSSSSSSK....',
  '....KSLSSLSK....',
  '....KSSSSSSK....',
  '....KSFFFFSK....',
  '.....KFFFFK.....',
  '.....KEFFEK.....',
  '......FFFF......',
  '...KKSSSSSSKK...',
  '..KSSKSSSSKSSK..',
  '..K.KSSSSSSK.K..',
  '....KSSSSSSK....',
  '....KKK..KKK....',
];

// 蝙蝠 14x10（两帧：翅膀上下）
const BAT_0 = [
  'PP........PP',
  'PPP......PPP',
  'PPPPPKKPPPPP',
  '..PPPKKKPPP.',
  '...PPKKKPP.',
  '...PDKDKDP.',
  '....PKKKP..',
  '.....PKP...',
  '......P....',
  '.............',
];
const BAT_1 = [
  '.............',
  '.............',
  '....PKKKP...',
  '...PDKDKDP..',
  '..PPPKKKPPP.',
  '.PPPPKKPPPPP',
  'PPPPPKKPPPPP',
  'PPP......PPP',
  'PP........PP',
  '.............',
];

// 骷髅 12x16
const SKELETON = [
  '...KKKKKK...',
  '...KWWWWK...',
  '..KWKWWKWK..',
  '..KWWWWWWK..',
  '..KWKWKWKK..',
  '...KWWWWK...',
  '....KWWK....',
  '...KKWWKK...',
  '..KWKWWKWK..',
  '..K.KWWK.K..',
  '....KWWK....',
  '....KWKK....',
  '....KWK.....',
  '...KK.KK....',
  '...K...K....',
  '.............',
];

// 史莱姆 14x12（两帧：挤压）
const SLIME_0 = [
  '..............',
  '....MMMMMM....',
  '..MMMMMMMMMM..',
  '.MMMMMMMMMMMM.',
  '.MMKMMMMMKMMM.',
  '.MMKMMMMMKMMM.',
  '.MMMMMMMMMMMM.',
  '.MMMMMNNMMMMM.',
  '..MMMMNNMMMM..',
  '...MMMMMMMM...',
  '..............',
  '..............',
];
const SLIME_1 = [
  '..............',
  '..............',
  '..............',
  '...MMMMMMMM...',
  '.MMMMMMMMMMMM.',
  'MMMKMMMMMMKMMM',
  'MMMKMMMMMMKMMM',
  'MMMMMMMMMMMMMM',
  'MMMMMMNNMMMMMM',
  '.MMMMMNNMMMMM.',
  '..MMMMMMMMMM..',
  '..............',
];

// 蓝色经验宝石 10x12
const GEM = [
  '...BB...',
  '..BBBB..',
  '.BBCCBB.',
  'BBCCCCBB',
  'BBCCCCBB',
  '.BBCCBB.',
  '..BBBB..',
  '...BB...',
  '..........',
  '..........',
  '..........',
  '..........',
];

// 金币 10x10
const COIN = [
  '..OOOO..',
  '.OOYYOO.',
  'OOYOOYOO',
  'OYOOOOYO',
  'OYOOOOYO',
  'OOYOOYOO',
  '.OOYYOO.',
  '..OOOO..',
  '........',
  '........',
];

// 飞斧 12x12
const AXE = [
  '...TTTTT..',
  '..TTTTTTT.',
  '..TTKTTTT.',
  '..TTTTTT..',
  '...TTTT...',
  '....AA....',
  '...AA.....',
  '...AA.....',
  '..AA......',
  '..AA......',
  '.AA.......',
  '...........',
];

// 飞弹 8x8
const BOLT = [
  '..UU..',
  '.UVVU.',
  'UVVVVU',
  'UVVVVU',
  '.UVVU.',
  '..UU..',
  '......',
  '......',
];

// 把字符画渲染成 canvas（返回 canvas，可直接 drawImage）
function bake(rows) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = PAL[row[x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

// 预烘焙所有精灵
export const SPR = {
  knight: bake(KNIGHT),
  bat: [bake(BAT_0), bake(BAT_1)],
  skeleton: bake(SKELETON),
  slime: [bake(SLIME_0), bake(SLIME_1)],
  gem: bake(GEM),
  coin: bake(COIN),
  axe: bake(AXE),
  bolt: bake(BOLT),
};

// 画精灵：居中绘制，scale 放大倍数，flash 受击闪白，alpha 透明度
export function drawSprite(g, img, x, y, scale = 3, flash = false, alpha = 1) {
  g.save();
  g.globalAlpha = alpha;
  const w = img.width * scale;
  const h = img.height * scale;
  if (flash) {
    // 闪白：先画原图，再用 source-atop 盖白色
    const t = document.createElement('canvas');
    t.width = img.width;
    t.height = img.height;
    const tg = t.getContext('2d');
    tg.drawImage(img, 0, 0);
    tg.globalCompositeOperation = 'source-atop';
    tg.fillStyle = '#ffffff';
    tg.fillRect(0, 0, t.width, t.height);
    g.drawImage(t, x - w / 2, y - h / 2, w, h);
  } else {
    g.drawImage(img, x - w / 2, y - h / 2, w, h);
  }
  g.restore();
}
