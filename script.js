"use strict";

// ============================================================================
//  CONSTANTS
// ============================================================================
const W = 220,
    H = 390;

const COLORS = {
    sky: "#3aa0e8",
    skyHigh: "#62b8ec",
    stadium: "#2a1a0a",
    railing: "#105506",
    courtA: "#c47a3d",
    courtB: "#b06a30",
    courtDark: "#7a4520",
    lines: "#f5f5f5",
    net: "#dcdcdc",
    netDark: "#888",
    player: "#e23838",
    playerAlt: "#8a1010",
    cpu: "#3858d8",
    cpuAlt: "#1a2a8a",
    skin: "#f4c890",
    ball: "#fae850",
    ballEdge: "#c9a418",
    shadow: "#0a0a14",
    hud: "#000",
    accent: "#f0a020",
    splashBg: "#1a0e2e"
};

const CROWD_HATS = [
    "#e23838",
    "#3858d8",
    "#fae850",
    "#2d7a3e",
    "#1a1a1a",
    "#f0a020",
    "#a040b8",
    "#3a8a5a"
];
const CROWD_SKINS = ["#f4c890", "#d4a070", "#8a6040", "#a07050"];

const COURT = {
    nearY: 372,
    farY: 104,
    nearLeftX: 30,
    nearRightX: 190,
    farLeftX: 78,
    farRightX: 142,
    nearLeftXOuter: 8,
    nearRightXOuter: 212,
    farLeftXOuter: 64,
    farRightXOuter: 156
};

const PHYS = {
    gravity: 0.08,
    flightFrames: 60,
    bounceDamp: 0.55,
    netZ: 8,
    hitZmin: 2,
    hitZmax: 30,
    hitRadius: 0.2
};

const STATE = {
    SPLASH: "splash",
    SERVING: "serving",
    RALLYING: "rallying",
    POINT_END: "pointEnd",
    MATCH_END: "matchEnd"
};

// Mute button hit zone, bottom-right.
const MUTE_BTN = { x: 196, y: 370, w: 20, h: 16 };

const SPLASH_SOUND_BTN = { x: 60, y: 265, w: 100, h: 22 };
const SPLASH_START_BTN = { x: 30, y: 335, w: 160, h: 32 };

// ============================================================================
//  PIXEL ARROW SPRITES
// ============================================================================
const ARROW = {
    NW: [
        "####...",
        "##.....",
        "#.#....",
        "#..#...",
        "....#..",
        ".....#.",
        "......#"
    ],
    N: [
        "...#...",
        "..###..",
        ".#####.",
        "#..#..#",
        "...#...",
        "...#...",
        "...#..."
    ],
    NE: [
        "...####",
        ".....##",
        "....#.#",
        "...#..#",
        "..#....",
        ".#.....",
        "#......"
    ],
    W: [
        "...#...",
        "..##...",
        ".######",
        "#######",
        ".######",
        "..##...",
        "...#..."
    ],
    E: [
        "...#...",
        "...##..",
        "######.",
        "#######",
        "######.",
        "...##..",
        "...#..."
    ]
};

const CLOUD = {
    big: [
        "....######....",
        "..##########..",
        ".############.",
        "##############",
        ".############.",
        "..##########..",
        "....######...."
    ],
    small: ["...####...", ".########.", "##########", ".########.", "..######.."],
    tiny: ["..####..", ".######.", "########", ".######."]
};

function drawSprite(ctx, sprite, x, y, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < sprite.length; r++) {
        const row = sprite[r];
        for (let c = 0; c < row.length; c++) {
            if (row[c] === "#") ctx.fillRect(x + c, y + r, 1, 1);
        }
    }
}

// ============================================================================
//  PROJECTION
// ============================================================================
// HACK: non-linear y mapping. Linear projection feels wrong from a
// behind-baseline viewpoint; raising y to a power < 1 compresses the far
// half so the back of the court reads correctly.
const PERSPECTIVE_EASE = 0.82;

function projectGround(x, y) {
    const t = Math.pow(y, PERSPECTIVE_EASE);
    const lx = COURT.nearLeftX + (COURT.farLeftX - COURT.nearLeftX) * t;
    const rx = COURT.nearRightX + (COURT.farRightX - COURT.nearRightX) * t;
    const sx = lx + (rx - lx) * (x + 1) * 0.5;
    const sy = COURT.nearY + (COURT.farY - COURT.nearY) * t;
    return { sx, sy };
}
function projectScale(y) {
    return 1 - 0.55 * Math.pow(y, PERSPECTIVE_EASE);
}
function project(x, y, z) {
    const g = projectGround(x, y);
    const s = projectScale(y);
    return { sx: g.sx, sy: g.sy - z * s, scale: s };
}

// ============================================================================
//  COURT
// ============================================================================
class Court {
    constructor() {
        this.crowd = this._buildCrowd();
    }

    _buildCrowd() {
        const heads = [];
        const startY = 52;
        const rowSpacing = 9;
        const colSpacing = 4;
        const rows = 5;
        const cols = Math.ceil(W / colSpacing) + 2;
        const FLASH_PERIOD = 3000;
        for (let row = 0; row < rows; row++) {
            const y = startY + row * rowSpacing;
            const offsetX = row % 2 === 0 ? 0 : 2;
            for (let col = 0; col < cols; col++) {
                const x = col * colSpacing + offsetX - 1;
                if (x < -1 || x > W) continue;
                const seed = Math.abs((col * 31 + row * 53 + 11) | 0);
                heads.push({
                    x: x,
                    y: y,
                    hat: CROWD_HATS[seed % CROWD_HATS.length],
                    skin: CROWD_SKINS[(seed >> 2) % CROWD_SKINS.length],
                    // HACK: random phase, not arithmetic — a hash like (seed*17)%period
                    // creates row-correlated cascades that visually climb the stands.
                    flashSeed: Math.floor(Math.random() * FLASH_PERIOD)
                });
            }
        }
        return heads;
    }

    draw(ctx, frame) {
        ctx.fillStyle = COLORS.skyHigh;
        ctx.fillRect(0, 26, W, 8);
        ctx.fillStyle = COLORS.sky;
        ctx.fillRect(0, 34, W, 14);

        ctx.fillStyle = COLORS.stadium;
        ctx.fillRect(0, 48, W, 4);

        this.drawCrowdLayer(ctx, frame);

        ctx.fillStyle = COLORS.railing;
        ctx.fillRect(0, 94, W, 6);
        ctx.fillStyle = "#241410";
        ctx.fillRect(0, 100, W, 4);

        ctx.fillStyle = COLORS.courtDark;
        ctx.fillRect(0, 104, W, H - 104);

        ctx.fillStyle = COLORS.courtA;
        ctx.beginPath();
        ctx.moveTo(COURT.nearLeftXOuter, COURT.nearY);
        ctx.lineTo(COURT.nearRightXOuter, COURT.nearY);
        ctx.lineTo(COURT.farRightXOuter, COURT.farY);
        ctx.lineTo(COURT.farLeftXOuter, COURT.farY);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = COLORS.courtB;
        this._fillTrapZone(ctx, 0.25, 0.5);
        this._fillTrapZone(ctx, 0.5, 0.75);

        ctx.strokeStyle = COLORS.lines;
        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(COURT.nearLeftXOuter, COURT.nearY);
        ctx.lineTo(COURT.nearRightXOuter, COURT.nearY);
        ctx.lineTo(COURT.farRightXOuter, COURT.farY);
        ctx.lineTo(COURT.farLeftXOuter, COURT.farY);
        ctx.closePath();
        ctx.stroke();

        this._line(ctx, -1, 0, -1, 1);
        this._line(ctx, 1, 0, 1, 1);

        this._line(ctx, -1, 0.25, 1, 0.25);
        this._line(ctx, -1, 0.75, 1, 0.75);
        this._line(ctx, 0, 0.25, 0, 0.75);

        this._line(ctx, -0.05, 1, 0.05, 1);
        this._line(ctx, -0.05, 0, 0.05, 0);

        this.drawNet(ctx);
    }

    drawCrowdLayer(ctx, frame, dy = 0) {
        // HACK: wipe the entire crowd zone every frame. Heads sit on a sparse
        // grid; stray flash pixels would otherwise accumulate and bleach the
        // stand white over time.
        ctx.fillStyle = "#0e0805";
        ctx.fillRect(0, 48 + dy, W, 50);

        for (let i = 0; i < this.crowd.length; i++) {
            const h = this.crowd[i];
            ctx.fillStyle = h.hat;
            ctx.fillRect(h.x, h.y + 2 + dy, 2, 3);
            ctx.fillStyle = h.skin;
            ctx.fillRect(h.x, h.y + dy, 2, 2);

            if ((frame + h.flashSeed) % 3000 < 3) {
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(h.x - 1, h.y - 1 + dy, 4, 5);
            }
        }
    }

    _fillTrapZone(ctx, y1, y2) {
        const a = projectGround(-1, y1),
            b = projectGround(1, y1);
        const c = projectGround(1, y2),
            d = projectGround(-1, y2);
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.lineTo(c.sx, c.sy);
        ctx.lineTo(d.sx, d.sy);
        ctx.closePath();
        ctx.fill();
    }

    _line(ctx, x1, y1, x2, y2) {
        const a = projectGround(x1, y1),
            b = projectGround(x2, y2);
        ctx.beginPath();
        ctx.moveTo(a.sx + 0.5, a.sy + 0.5);
        ctx.lineTo(b.sx + 0.5, b.sy + 0.5);
        ctx.stroke();
    }

    drawNet(ctx) {
        const left = projectGround(-1.55, 0.5);
        const right = projectGround(1.55, 0.5);
        const netH = 18;
        ctx.fillStyle = COLORS.netDark;
        ctx.fillRect(left.sx, left.sy - netH, right.sx - left.sx, netH);
        ctx.fillStyle = COLORS.net;
        for (let y = 0; y < netH; y += 2) {
            ctx.fillRect(left.sx, left.sy - netH + y, right.sx - left.sx, 1);
        }
        ctx.fillStyle = "#fff";
        ctx.fillRect(left.sx, left.sy - netH, right.sx - left.sx, 2);
        ctx.fillStyle = "#222";
        ctx.fillRect(left.sx - 2, left.sy - netH - 2, 2, netH + 4);
        ctx.fillRect(right.sx, right.sy - netH - 2, 2, netH + 4);
    }
}

// ============================================================================
//  BALL
// ============================================================================
class Ball {
    constructor() {
        this.reset();
    }

    reset() {
        this.x = 0;
        this.y = 0.5;
        this.z = 0;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.active = false;
        this.outOfPlay = false;
        this.bouncedOnTargetSide = false;
        this.lastHitter = null;
        this.targetSide = null;
        this.hitNet = false;
    }

    hit(tx, ty, hitter) {
        const T = PHYS.flightFrames;
        this.vx = (tx - this.x) / T;
        this.vy = (ty - this.y) / T;
        this.vz = 0.5 * PHYS.gravity * T - this.z / T;
        this.lastHitter = hitter;
        this.targetSide = hitter === "player" ? "cpu" : "player";
        this.bouncedOnTargetSide = false;
        this.active = true;
        this.outOfPlay = false;
        this.hitNet = false;
    }

    update() {
        if (!this.active) return;
        const prevY = this.y;
        this.x += this.vx;
        this.y += this.vy;
        this.z += this.vz;
        this.vz -= PHYS.gravity;

        const crossed =
            (prevY < 0.5 && this.y >= 0.5) || (prevY > 0.5 && this.y <= 0.5);
        if (crossed && this.z < PHYS.netZ) {
            this.hitNet = true;
            this.outOfPlay = true;
            this.active = false;
            return;
        }

        if (this.z <= 0) {
            this.z = 0;
            this.vz = -this.vz * PHYS.bounceDamp;
            if (!this.bouncedOnTargetSide) {
                const inX = Math.abs(this.x) <= 1;
                const inY = this.y >= 0 && this.y <= 1;
                const correctSide =
                    (this.targetSide === "cpu" && this.y > 0.5) ||
                    (this.targetSide === "player" && this.y < 0.5);
                if (inX && inY && correctSide) this.bouncedOnTargetSide = true;
                else {
                    this.outOfPlay = true;
                    this.active = false;
                    return;
                }
            }
            if (Math.abs(this.vz) < 0.5) this.active = false;
        }

        if (Math.abs(this.x) > 1.6 || this.y < -0.25 || this.y > 1.25) {
            this.outOfPlay = true;
            this.active = false;
        }
    }

    predictHitPoint() {
        let x = this.x,
            y = this.y,
            z = this.z;
        let vx = this.vx,
            vy = this.vy,
            vz = this.vz;
        let bounced = this.bouncedOnTargetSide;
        for (let i = 0; i < 200; i++) {
            x += vx;
            y += vy;
            z += vz;
            vz -= PHYS.gravity;
            if (z <= 0) {
                if (!bounced) {
                    bounced = true;
                    z = 0;
                    vz = -vz * PHYS.bounceDamp;
                    continue;
                }
                return { x, y };
            }
            if (bounced && vz <= 0) {
                return { x, y };
            }
        }
        return { x, y };
    }

    draw(ctx) {
        if (!this.active && this.z <= 0 && !this.outOfPlay) return;
        const p = project(this.x, this.y, this.z);
        const g = projectGround(this.x, this.y);
        const r = Math.max(2, Math.round(4 * p.scale));

        ctx.fillStyle = COLORS.shadow;
        ctx.beginPath();
        ctx.ellipse(g.sx, g.sy, r, Math.max(1, r * 0.4), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = COLORS.ballEdge;
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = COLORS.ball;
        ctx.beginPath();
        ctx.arc(p.sx - 1, p.sy - 1, Math.max(1, r - 1), 0, Math.PI * 2);
        ctx.fill();
    }
}

// ============================================================================
//  PLAYERS
// ============================================================================
class Player {
    constructor(side) {
        this.side = side;
        this.x = 0;
        this.y = side === "near" ? 0.05 : 0.95;
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = 0.015;
        this.swingAnim = 0;
        this.facing = 1;
    }

    setTarget(x, y) {
        this.targetX = Math.max(-0.95, Math.min(0.95, x));
        if (this.side === "near") this.targetY = Math.max(0.0, Math.min(0.45, y));
        else this.targetY = Math.max(0.55, Math.min(1.0, y));
    }

    update() {
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const d = Math.hypot(dx, dy);
        if (d > this.speed) {
            this.x += (dx / d) * this.speed;
            this.y += (dy / d) * this.speed;
            if (Math.abs(dx) > 0.001) this.facing = dx > 0 ? 1 : -1;
        } else {
            this.x = this.targetX;
            this.y = this.targetY;
        }
        if (this.swingAnim > 0) this.swingAnim--;
    }

    triggerSwing() {
        this.swingAnim = 14;
    }

    draw(ctx) {
        const p = project(this.x, this.y, 0);
        const s = p.scale;
        const w = Math.max(10, Math.round(18 * s));
        const h = Math.max(20, Math.round(34 * s));
        const main = this.side === "near" ? COLORS.player : COLORS.cpu;
        const alt = this.side === "near" ? COLORS.playerAlt : COLORS.cpuAlt;

        ctx.fillStyle = COLORS.shadow;
        ctx.beginPath();
        ctx.ellipse(p.sx, p.sy + 1, w * 0.5, w * 0.25, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#fff";
        ctx.fillRect(
            Math.round(p.sx - w / 2),
            Math.round(p.sy - h * 0.45),
            w,
            Math.round(h * 0.25)
        );
        ctx.fillStyle = COLORS.skin;
        ctx.fillRect(
            Math.round(p.sx - w / 2),
            Math.round(p.sy - h * 0.2),
            Math.floor(w * 0.4),
            Math.round(h * 0.2)
        );
        ctx.fillRect(
            Math.round(p.sx + w / 2 - Math.floor(w * 0.4)),
            Math.round(p.sy - h * 0.2),
            Math.floor(w * 0.4),
            Math.round(h * 0.2)
        );
        ctx.fillStyle = main;
        ctx.fillRect(
            Math.round(p.sx - w / 2),
            Math.round(p.sy - h * 0.85),
            w,
            Math.round(h * 0.45)
        );
        ctx.fillStyle = alt;
        ctx.fillRect(Math.round(p.sx - w / 2), Math.round(p.sy - h * 0.55), w, 2);
        const hd = Math.max(7, Math.round(10 * s));
        ctx.fillStyle = COLORS.skin;
        ctx.fillRect(
            Math.round(p.sx - hd / 2),
            Math.round(p.sy - h - hd * 0.4),
            hd,
            hd
        );
        ctx.fillStyle = alt;
        ctx.fillRect(
            Math.round(p.sx - hd / 2),
            Math.round(p.sy - h - hd * 0.4),
            hd,
            Math.max(2, Math.round(hd * 0.35))
        );

        const swinging = this.swingAnim > 0;
        const dir = this.facing;

        const torsoX = Math.round(p.sx);
        const shoulderY = Math.round(p.sy - h * 0.65);

        let wristX, wristY, racketX, racketY;
        if (swinging) {
            wristX = torsoX + dir * Math.round(w * 0.55);
            wristY = shoulderY + 2;
            racketX = torsoX + dir * Math.round(w * 0.95);
            racketY = shoulderY - 1;
        } else {
            wristX = torsoX + dir * Math.round(w * 0.4);
            wristY = shoulderY + Math.round(h * 0.2);
            racketX = wristX;
            racketY = wristY - Math.round(h * 0.3);
        }

        ctx.fillStyle = COLORS.skin;
        const armMidX = Math.round((torsoX + dir * (w * 0.25) + wristX) / 2);
        const armMidY = Math.round((shoulderY + wristY) / 2);
        ctx.fillRect(armMidX, armMidY, 2, 2);
        ctx.fillRect(wristX, wristY, 2, 2);

        ctx.fillStyle = "#5a3a1a";
        if (swinging) {
            ctx.fillRect(wristX + dir * 2, wristY, 2, 1);
        } else {
            ctx.fillRect(wristX, wristY - 2, 1, 2);
        }

        const cx = racketX,
            cy = racketY;
        ctx.fillStyle = "#111";
        ctx.fillRect(cx - 2, cy - 4, 5, 1);
        ctx.fillRect(cx - 2, cy + 4, 5, 1);
        ctx.fillRect(cx - 4, cy - 2, 1, 5);
        ctx.fillRect(cx + 4, cy - 2, 1, 5);
        ctx.fillRect(cx - 3, cy - 3, 1, 1);
        ctx.fillRect(cx + 3, cy - 3, 1, 1);
        ctx.fillRect(cx - 3, cy + 3, 1, 1);
        ctx.fillRect(cx + 3, cy + 3, 1, 1);
        ctx.fillStyle = "#dcdcdc";
        ctx.fillRect(cx - 2, cy - 3, 5, 7);
        ctx.fillRect(cx - 3, cy - 1, 1, 3);
        ctx.fillRect(cx + 3, cy - 1, 1, 3);
    }
}

class HumanPlayer extends Player {
    constructor() {
        super("near");
    }
    trackBall(ball) {
        if (!ball.active || ball.lastHitter !== "cpu" || ball.targetSide !== "player")
            return;
        const p = ball.predictHitPoint();
        this.setTarget(p.x, p.y);
    }
}

class AIPlayer extends Player {
    constructor() {
        super("far");
        // HACK: tighter hitRadius than the player (0.20). The CPU has perfect
        // prediction, AND the perspective shrinks its sprite to ~48% on screen,
        // so the same court-units radius *looks* like much more reach.
        this.hitRadius = 0.12;
        this.errorRate = 0.12;
        this.speed = 0.015;
    }
    trackBall(ball) {
        if (!ball.active || ball.lastHitter !== "player" || ball.targetSide !== "cpu")
            return;
        const p = ball.predictHitPoint();
        this.setTarget(p.x + (Math.random() - 0.5) * 0.04, p.y);
    }
    tryHit(ball) {
        if (!ball.active || ball.targetSide !== "cpu" || !ball.bouncedOnTargetSide)
            return false;
        if (ball.z < PHYS.hitZmin || ball.z > PHYS.hitZmax) return false;
        if (Math.hypot(ball.x - this.x, ball.y - this.y) > this.hitRadius)
            return false;

        let tx, ty;
        if (Math.random() < this.errorRate) {
            tx = (Math.random() - 0.5) * 2.6;
            ty = -0.05 + Math.random() * 0.55;
        } else {
            const z = Math.random();
            if (z < 0.34) tx = -0.6 + (Math.random() - 0.5) * 0.18;
            else if (z < 0.68) tx = 0.0 + (Math.random() - 0.5) * 0.2;
            else tx = 0.6 + (Math.random() - 0.5) * 0.18;
            ty = 0.1 + Math.random() * 0.3;
        }
        ball.hit(tx, ty, "cpu");
        this.triggerSwing();
        return true;
    }
}

// ============================================================================
//  INPUT MANAGER
// ============================================================================
class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        // uiHit(canvasX, canvasY) returning true consumes the input.
        this.cb = { swing: null, any: null, uiHit: null };
        this.touch = null;
        canvas.addEventListener("touchstart", (e) => this._tStart(e), {
            passive: false
        });
        canvas.addEventListener("touchend", (e) => this._tEnd(e), { passive: false });
        canvas.addEventListener("touchmove", (e) => e.preventDefault(), {
            passive: false
        });
        canvas.addEventListener("mousedown", (e) => this._mDown(e));
        window.addEventListener("keydown", (e) => this._kDown(e));
    }
    on(evt, fn) {
        this.cb[evt] = fn;
    }
    _fire(evt, arg) {
        if (this.cb[evt]) this.cb[evt](arg);
    }

    _toCanvas(clientX, clientY) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (clientX - rect.left) * (W / rect.width),
            y: (clientY - rect.top) * (H / rect.height)
        };
    }

    _tStart(e) {
        e.preventDefault();
        const t = e.changedTouches[0];
        const c = this._toCanvas(t.clientX, t.clientY);
        if (this.cb.uiHit && this.cb.uiHit(c.x, c.y)) return;
        this.touch = { x: t.clientX, y: t.clientY, t: Date.now() };
        this._fire("any");
    }
    _tEnd(e) {
        e.preventDefault();
        if (!this.touch) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - this.touch.x;
        const dy = t.clientY - this.touch.y;
        const dt = Date.now() - this.touch.t;
        const dist = Math.hypot(dx, dy);
        this.touch = null;
        if (dist < 25 || dt > 700 || dy > -15) return;
        let dir;
        if (Math.abs(dx) < dist * 0.4) dir = "CENTER";
        else if (dx < 0) dir = "LEFT";
        else dir = "RIGHT";
        this._fire("swing", dir);
    }
    _mDown(e) {
        const c = this._toCanvas(e.clientX, e.clientY);
        if (this.cb.uiHit && this.cb.uiHit(c.x, c.y)) return;
        this._fire("any");
    }
    _kDown(e) {
        if (e.key === "m" || e.key === "M") {
            if (this.cb.uiHit) this.cb.uiHit(-1, -1); // sentinel: keyboard mute
            e.preventDefault();
            return;
        }
        this._fire("any");
        if (e.key === "ArrowLeft") {
            this._fire("swing", "LEFT");
            e.preventDefault();
        }
        if (e.key === "ArrowUp") {
            this._fire("swing", "CENTER");
            e.preventDefault();
        }
        if (e.key === "ArrowRight") {
            this._fire("swing", "RIGHT");
            e.preventDefault();
        }
    }
}

// ============================================================================
//  SCOREBOARD
// ============================================================================
class Scoreboard {
    constructor() {
        this.reset();
    }
    reset() {
        this.points = [0, 0];
        this.games = [0, 0];
        this.serverIdx = 0;
        this.matchOver = false;
        this.winner = null;
    }
    scorePoint(idx) {
        const opp = 1 - idx;
        const me = this.points[idx],
            you = this.points[opp];
        if (me >= 3 && you >= 3) {
            if (me === you) this.points[idx] = me + 1;
            else if (me > you) this._winGame(idx);
            else this.points[opp] = you - 1;
        } else {
            if (me === 3) this._winGame(idx);
            else this.points[idx] = me + 1;
        }
    }
    _winGame(idx) {
        this.games[idx] += 1;
        this.serverIdx = 1 - this.serverIdx;
        this.matchOver = true;
        this.winner = idx;
    }
    pointDisplay() {
        const map = ["00", "15", "30", "40"];
        const a = this.points[0],
            b = this.points[1];
        if (a >= 3 && b >= 3) {
            if (a === b) return ["40", "40"];
            if (a > b) return ["AD", "--"];
            return ["--", "AD"];
        }
        return [map[a], map[b]];
    }
}

// ============================================================================
//  SFX
// ============================================================================
class SFX {
    constructor() {
        this.ctx = null;
        this.muted = true;
    }

    // HACK: lazy init on first user gesture — browsers block autoplay otherwise.
    ensureCtx() {
        if (this.ctx) return;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) {
            this.muted = true;
            return;
        }
        try {
            this.ctx = new AC();
        } catch (e) {
            this.muted = true;
        }
    }

    _beep(freq, duration, type, vol = 0.18) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, t0);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.005);
        gain.gain.linearRampToValueAtTime(0, t0 + duration);
        osc.connect(gain).connect(this.ctx.destination);
        osc.start(t0);
        osc.stop(t0 + duration + 0.02);
    }

    _seq(notes, gap = 0.08) {
        if (!this.ctx || this.muted) return;
        notes.forEach((n, i) => {
            setTimeout(
                () => this._beep(n.f, n.d, n.t || "square", n.v || 0.18),
                i * gap * 1000
            );
        });
    }

    hit() {
        this._beep(220, 0.05, "square", 0.22);
    }
    bounce() {
        this._beep(720, 0.03, "square", 0.1);
    }
    net() {
        this._beep(90, 0.12, "sine", 0.25);
    }
    serve() {
        this._beep(440, 0.04, "square", 0.14);
    }

    point() {
        this._seq(
            [
                { f: 523, d: 0.08 }, // C5
                { f: 784, d: 0.12 } // G5
            ],
            0.08
        );
    }

    lost() {
        this._seq(
            [
                { f: 392, d: 0.08 }, // G4
                { f: 262, d: 0.14 } // C4
            ],
            0.08
        );
    }

    win() {
        this._seq(
            [
                { f: 523, d: 0.1 }, // C5
                { f: 659, d: 0.1 }, // E5
                { f: 784, d: 0.1 }, // G5
                { f: 1047, d: 0.22 } // C6
            ],
            0.12
        );
    }

    defeat() {
        this._seq(
            [
                { f: 523, d: 0.1 }, // C5
                { f: 466, d: 0.1 }, // Bb4
                { f: 392, d: 0.1 }, // G4
                { f: 311, d: 0.28 } // Eb4
            ],
            0.14
        );
    }

    cheer() {
        if (!this.ctx || this.muted) return;
        const ctx = this.ctx;
        const t0 = ctx.currentTime;
        const dur = 1.6;
        const bufSize = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = ctx.createBufferSource();
        noise.buffer = buf;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = "bandpass";
        noiseFilter.Q.value = 4.2;
        noiseFilter.frequency.setValueAtTime(990, t0);
        noiseFilter.frequency.linearRampToValueAtTime(920, t0 + dur);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0, t0);
        noiseGain.gain.linearRampToValueAtTime(0.19, t0 + 0.08);
        noiseGain.gain.linearRampToValueAtTime(0.076, t0 + dur * 0.5);
        noiseGain.gain.linearRampToValueAtTime(0, t0 + dur);

        noise.connect(noiseFilter).connect(noiseGain).connect(ctx.destination);
        noise.start(t0);
        noise.stop(t0 + dur + 0.05);

        const voicesBus = ctx.createGain();
        voicesBus.gain.value = 1;

        const tonalFilter = ctx.createBiquadFilter();
        tonalFilter.type = "bandpass";
        tonalFilter.Q.value = 1;
        tonalFilter.frequency.setValueAtTime(3960, t0);
        tonalFilter.frequency.linearRampToValueAtTime(1540, t0 + dur);

        voicesBus.connect(tonalFilter).connect(ctx.destination);

        const voices = 6;
        const fMin = 249,
            fMax = 314;
        const stepMinS = 0.03,
            stepMaxS = 0.07;
        const gainPerVoice = 0.07 / voices; // ≈ 0.0117
        const attack = 0.308;

        for (let v = 0; v < voices; v++) {
            const osc = ctx.createOscillator();
            osc.type = "sine";

            const tStart = t0 + v * 0.1;
            let t = tStart;
            let first = true;
            while (t < t0 + dur - 0.01) {
                const f = fMin + Math.random() * (fMax - fMin);
                osc.frequency.setValueAtTime(f, first ? tStart : t);
                first = false;
                t += stepMinS + Math.random() * (stepMaxS - stepMinS);
            }

            const g = ctx.createGain();
            g.gain.setValueAtTime(0, tStart);
            g.gain.linearRampToValueAtTime(gainPerVoice, tStart + attack);
            g.gain.linearRampToValueAtTime(gainPerVoice * 0.7, tStart + dur * 0.4);
            g.gain.linearRampToValueAtTime(0, t0 + dur);

            osc.connect(g).connect(voicesBus);
            osc.start(tStart);
            osc.stop(t0 + dur + 0.05);
        }
    }
}

// ============================================================================
//  MUSIC
// ============================================================================
class Music {
    constructor(sfx) {
        this.sfx = sfx;
        this.measures = [
            {
                lead: [587.33, 783.99, 987.77, 783.99, 880.0, 987.77, 880.0, 783.99],
                bassT: 196.0,
                bassF: 293.66
            },
            {
                lead: [659.25, 783.99, 1046.5, 783.99, 659.25, 783.99, 880.0, 783.99],
                bassT: 130.81,
                bassF: 196.0
            },
            {
                lead: [587.33, 739.99, 880.0, 739.99, 587.33, 880.0, 739.99, 880.0],
                bassT: 146.83,
                bassF: 220.0
            },
            {
                lead: [783.99, 987.77, 1174.66, 987.77, 783.99, 587.33, 783.99, 987.77],
                bassT: 196.0,
                bassF: 293.66
            },
            {
                lead: [587.33, 783.99, 987.77, 783.99, 880.0, 987.77, 880.0, 783.99],
                bassT: 196.0,
                bassF: 293.66
            },
            {
                lead: [659.25, 783.99, 1046.5, 783.99, 659.25, 783.99, 880.0, 783.99],
                bassT: 130.81,
                bassF: 196.0
            },
            {
                lead: [587.33, 739.99, 880.0, 739.99, 587.33, 880.0, 739.99, 880.0],
                bassT: 146.83,
                bassF: 220.0
            },
            {
                lead: [783.99, 987.77, 1174.66, 1567.98, 1174.66, 987.77, 1567.98, 1174.66],
                bassT: 196.0,
                bassF: 293.66
            }
        ];
        this.tempoMs = 130;
        this.step = 0;
        this.timer = null;
        this.leadOsc = null;
        this.bassOsc = null;
        this.leadGain = null;
        this.bassGain = null;
    }

    start() {
        if (this.timer || this.sfx.muted || !this.sfx.ctx) return;
        const ctx = this.sfx.ctx;
        this.leadGain = ctx.createGain();
        this.bassGain = ctx.createGain();
        this.leadGain.connect(ctx.destination);
        this.bassGain.connect(ctx.destination);
        this.leadGain.gain.value = 0;
        this.bassGain.gain.value = 0;

        this.leadOsc = ctx.createOscillator();
        this.bassOsc = ctx.createOscillator();
        this.leadOsc.type = "sawtooth";
        this.bassOsc.type = "square";
        this.leadOsc.connect(this.leadGain);
        this.bassOsc.connect(this.bassGain);

        const now = ctx.currentTime;
        this.leadOsc.frequency.setValueAtTime(this.measures[0].lead[0], now);
        this.bassOsc.frequency.setValueAtTime(this.measures[0].bassT, now);

        this.leadOsc.start();
        this.bassOsc.start();

        this.leadGain.gain.setValueAtTime(0, now);
        this.leadGain.gain.linearRampToValueAtTime(0.05, now + 0.05);

        this.step = 0;
        this.timer = setInterval(() => this._tick(), this.tempoMs);
    }

    _tick() {
        if (!this.sfx.ctx || !this.leadOsc) return;
        const now = this.sfx.ctx.currentTime;
        const currentStep = this.step % 64;
        const measureIndex = Math.floor(currentStep / 8);
        const noteIndex = currentStep % 8;
        const m = this.measures[measureIndex];

        this.leadOsc.frequency.setTargetAtTime(m.lead[noteIndex], now, 0.01);

        const bassFreq = noteIndex % 2 === 0 ? m.bassT : m.bassF;
        this.bassOsc.frequency.setValueAtTime(bassFreq, now);
        this.bassGain.gain.cancelScheduledValues(now);
        this.bassGain.gain.setValueAtTime(this.bassGain.gain.value, now);
        this.bassGain.gain.linearRampToValueAtTime(0.0001, now + 0.005);
        this.bassGain.gain.linearRampToValueAtTime(0.1, now + 0.012);
        this.bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

        this.step++;
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.sfx.ctx && this.leadOsc) {
            const now = this.sfx.ctx.currentTime;
            try {
                this.leadGain.gain.cancelScheduledValues(now);
                this.leadGain.gain.linearRampToValueAtTime(0, now + 0.05);
                this.bassGain.gain.cancelScheduledValues(now);
                this.bassGain.gain.linearRampToValueAtTime(0, now + 0.05);
                this.leadOsc.stop(now + 0.08);
                this.bassOsc.stop(now + 0.08);
            } catch (e) { }
        }
        this.leadOsc = null;
        this.bassOsc = null;
        this.leadGain = null;
        this.bassGain = null;
    }

    isPlaying() {
        return this.timer !== null;
    }
}

class Game {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.ctx.imageSmoothingEnabled = false;

        this.court = new Court();
        this.ball = new Ball();
        this.player = new HumanPlayer();
        this.cpu = new AIPlayer();
        this.score = new Scoreboard();
        this.input = new InputManager(canvas);
        this.sfx = new SFX();
        this.music = new Music(this.sfx);

        this.state = STATE.SPLASH;
        this.timer = 0;
        this.lastWinner = null;
        this.frame = 0;
        this.lastTime = 0;
        this.accumulator = 0;
        this.STEP_MS = 1000 / 60;

        this.input.on("swing", (dir) => this.onSwing(dir));
        this.input.on("any", () => this.onAny());
        this.input.on("uiHit", (cx, cy) => this._uiHit(cx, cy));

        this._fit();
        window.addEventListener("resize", () => this._fit());
        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => this._fit());
        }
        requestAnimationFrame((t) => this.loop(t));
    }

    _fit() {
        const sw = window.innerWidth,
            sh = window.innerHeight;
        const scale = Math.min(sw / W, sh / H);
        this.canvas.style.width = W * scale + "px";
        this.canvas.style.height = H * scale + "px";
        const scan = document.getElementById("scan");
        scan.style.width = W * scale + "px";
        scan.style.height = H * scale + "px";
    }

    onAny() {
        this.sfx.ensureCtx();
        if (this.state === STATE.SPLASH) {
            if (!this.sfx.muted && !this.music.isPlaying()) this.music.start();
            return;
        }
        if (this.state === STATE.MATCH_END) {
            return;
        }
    }

    _uiHit(cx, cy) {
        if (cx < 0 && cy < 0) {
            this.sfx.ensureCtx();
            this._toggleMute();
            return true;
        }

        if (this.state === STATE.SPLASH) {
            if (this._inBtn(cx, cy, SPLASH_SOUND_BTN)) {
                this.sfx.ensureCtx();
                this._toggleMute();
                return true;
            }
            if (this._inBtn(cx, cy, SPLASH_START_BTN)) {
                this.sfx.ensureCtx();
                this.music.stop();
                this._startMatch();
                return true;
            }
            return true;
        }

        if (this.state === STATE.MATCH_END) {
            if (this._inBtn(cx, cy, MUTE_BTN)) {
                this.sfx.ensureCtx();
                this._toggleMute();
                return true;
            }
            if (this._inBtn(cx, cy, SPLASH_START_BTN)) {
                this.sfx.ensureCtx();
                this.music.stop();
                this._startMatch();
                return true;
            }
            return true;
        }

        if (this._inBtn(cx, cy, MUTE_BTN)) {
            this.sfx.ensureCtx();
            this._toggleMute();
            return true;
        }
        return false;
    }

    _inBtn(cx, cy, b) {
        return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
    }

    _toggleMute() {
        this.sfx.muted = !this.sfx.muted;
        if (this.sfx.muted) {
            this.music.stop();
        } else if (this.state === STATE.SPLASH || this.state === STATE.MATCH_END) {
            this.music.start();
        }
    }

    _drawSpeakerIcon(ctx, ox, oy, muted) {
        ctx.fillStyle = "#fff";
        ctx.fillRect(ox, oy + 3, 2, 2);
        ctx.fillRect(ox + 2, oy + 2, 1, 4);
        ctx.fillRect(ox + 3, oy + 1, 1, 6);
        ctx.fillRect(ox + 4, oy, 1, 8);

        if (muted) {
            ctx.fillStyle = "#e23838";
            ctx.fillRect(ox + 6, oy + 1, 1, 1);
            ctx.fillRect(ox + 7, oy + 2, 1, 1);
            ctx.fillRect(ox + 8, oy + 3, 1, 1);
            ctx.fillRect(ox + 9, oy + 4, 1, 1);
            ctx.fillRect(ox + 10, oy + 5, 1, 1);
            ctx.fillRect(ox + 10, oy + 1, 1, 1);
            ctx.fillRect(ox + 9, oy + 2, 1, 1);
            ctx.fillRect(ox + 8, oy + 3, 1, 1);
            ctx.fillRect(ox + 7, oy + 4, 1, 1);
            ctx.fillRect(ox + 6, oy + 5, 1, 1);
        } else {
            ctx.fillStyle = "#fff";
            ctx.fillRect(ox + 6, oy + 2, 1, 4);
            ctx.fillRect(ox + 7, oy + 1, 1, 1);
            ctx.fillRect(ox + 7, oy + 6, 1, 1);
            ctx.fillRect(ox + 8, oy + 3, 1, 2);
            ctx.fillRect(ox + 9, oy + 1, 1, 1);
            ctx.fillRect(ox + 9, oy + 6, 1, 1);
            ctx.fillRect(ox + 10, oy + 2, 1, 4);
        }
    }

    _drawMuteButton(ctx) {
        const b = MUTE_BTN;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(b.x, b.y, b.w, 1);
        ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
        ctx.fillRect(b.x, b.y, 1, b.h);
        ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);
        this._drawSpeakerIcon(ctx, b.x + 4, b.y + 4, this.sfx.muted);
    }

    _drawSplashSoundButton(ctx) {
        const b = SPLASH_SOUND_BTN;
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(b.x, b.y, b.w, 1);
        ctx.fillRect(b.x, b.y + b.h - 1, b.w, 1);
        ctx.fillRect(b.x, b.y, 1, b.h);
        ctx.fillRect(b.x + b.w - 1, b.y, 1, b.h);

        this._drawSpeakerIcon(ctx, b.x + 8, b.y + 7, this.sfx.muted);

        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = "left";
        ctx.fillStyle = "#fff";
        ctx.fillText(this.sfx.muted ? "SOUND OFF" : "SOUND ON", b.x + 25, b.y + 16);
    }

    _drawSplashStartButton(ctx) {
        const b = SPLASH_START_BTN;
        const blink = Math.floor(this.frame / 24) % 2 === 0;
        ctx.fillStyle = blink ? COLORS.accent : "#000";
        ctx.fillRect(b.x, b.y, b.w, b.h);
        ctx.fillStyle = blink ? "#000" : COLORS.accent;
        ctx.fillRect(b.x, b.y, b.w, 2);
        ctx.fillRect(b.x, b.y + b.h - 2, b.w, 2);
        ctx.fillRect(b.x, b.y, 2, b.h);
        ctx.fillRect(b.x + b.w - 2, b.y, 2, b.h);

        ctx.font = '16px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = blink ? "#000" : COLORS.accent;
        ctx.fillText("START", b.x + b.w / 2, b.y + 25);
    }

    onSwing(dir) {
        if (this.state !== STATE.RALLYING) return;
        this.player.triggerSwing();
        if (this.ball.targetSide !== "player" || !this.ball.bouncedOnTargetSide)
            return;
        if (this.ball.z < PHYS.hitZmin || this.ball.z > PHYS.hitZmax) return;
        if (
            Math.hypot(this.ball.x - this.player.x, this.ball.y - this.player.y) >=
            PHYS.hitRadius
        )
            return;

        let tx;
        if (dir === "LEFT") tx = -0.6;
        else if (dir === "RIGHT") tx = 0.6;
        else tx = 0.0;
        tx += (Math.random() - 0.5) * 0.12;
        const ty = 0.62 + Math.random() * 0.3;
        this.ball.hit(tx, ty, "player");
        this.sfx.hit();
    }

    _startMatch() {
        this.score.reset();
        this._startPoint();
    }

    _startPoint() {
        this.ball.reset();
        this.player.x = 0;
        this.player.y = 0.05;
        this.player.targetX = 0;
        this.player.targetY = 0.05;
        this.cpu.x = 0;
        this.cpu.y = 0.95;
        this.cpu.targetX = 0;
        this.cpu.targetY = 0.95;
        this.state = STATE.SERVING;
        this.timer = 70;
    }

    _serve() {
        const s = this.score.serverIdx;
        if (s === 0) {
            this.ball.x = 0.3;
            this.ball.y = 0.04;
            this.ball.z = 0;
            const tx = -0.35 + (Math.random() - 0.5) * 0.3;
            const ty = 0.62 + Math.random() * 0.1;
            this.ball.hit(tx, ty, "player");
            this.player.triggerSwing();
        } else {
            this.ball.x = -0.3;
            this.ball.y = 0.96;
            this.ball.z = 0;
            const tx = 0.3 + (Math.random() - 0.5) * 0.3;
            const ty = 0.32 + Math.random() * 0.1;
            this.ball.hit(tx, ty, "cpu");
            this.cpu.triggerSwing();
        }
        this.sfx.hit();
        this.state = STATE.RALLYING;
    }

    _endPoint() {
        let winner;
        if (this.ball.outOfPlay && !this.ball.bouncedOnTargetSide) {
            winner = this.ball.lastHitter === "player" ? 1 : 0;
        } else {
            winner = this.ball.targetSide === "player" ? 1 : 0;
        }
        this.lastWinner = winner;
        this.score.scorePoint(winner);
        this.state = STATE.POINT_END;
        this.timer = 80;
        if (!this.score.matchOver) {
            if (winner === 0) this.sfx.point();
            else this.sfx.lost();
        }
        this.sfx.cheer();
    }

    loop(now) {
        if (!this.lastTime) this.lastTime = now;
        this.accumulator += now - this.lastTime;
        this.lastTime = now;
        if (this.accumulator > 200) this.accumulator = 200;
        while (this.accumulator >= this.STEP_MS) {
            this.frame++;
            this.update();
            this.accumulator -= this.STEP_MS;
        }
        this.draw();
        requestAnimationFrame((t) => this.loop(t));
    }

    update() {
        if (this.state === STATE.SERVING) {
            this.timer--;
            if (this.timer <= 0) this._serve();
            this.player.update();
            this.cpu.update();
        } else if (this.state === STATE.RALLYING) {
            const prevVz = this.ball.vz;
            const prevHitter = this.ball.lastHitter;
            const wasActive = this.ball.active;

            this.ball.update();

            // HACK: detect a bounce by vz sign flip (negative→positive). It only
            // happens at z=0 inside Ball.update, so this never gives false positives.
            if (wasActive && this.ball.active && prevVz < 0 && this.ball.vz > 0) {
                this.sfx.bounce();
            }
            if (wasActive && !this.ball.active && this.ball.hitNet) {
                this.sfx.net();
            }

            this.player.trackBall(this.ball);
            this.cpu.trackBall(this.ball);
            this.player.update();
            this.cpu.update();

            const hitterBefore = prevHitter;
            this.cpu.tryHit(this.ball);
            if (this.ball.lastHitter === "cpu" && hitterBefore !== "cpu") {
                this.sfx.hit();
            }

            if (!this.ball.active) this._endPoint();
        } else if (this.state === STATE.POINT_END) {
            this.timer--;
            this.player.update();
            this.cpu.update();
            if (this.timer <= 0) {
                if (this.score.matchOver) {
                    this.state = STATE.MATCH_END;
                    if (this.score.winner === 0) this.sfx.win();
                    else this.sfx.defeat();
                    if (!this.sfx.muted) {
                        setTimeout(() => this.music.start(), 1500);
                    }
                } else {
                    this._startPoint();
                }
            }
        }
    }

    draw() {
        const ctx = this.ctx;
        if (this.state === STATE.SPLASH) {
            this._drawSplash();
            return;
        }

        this.court.draw(ctx, this.frame);

        const ents = [
            { y: this.cpu.y, fn: () => this.cpu.draw(ctx) },
            { y: this.player.y, fn: () => this.player.draw(ctx) }
        ];
        if (this.ball.active || this.ball.outOfPlay) {
            ents.push({ y: this.ball.y, fn: () => this.ball.draw(ctx) });
        }
        ents.sort((a, b) => b.y - a.y);
        ents.forEach((e) => e.fn());

        this._drawHUD();
        if (this.state === STATE.SERVING) this._drawServeHint();
        if (this.state === STATE.POINT_END) this._drawPointEnd();
        if (this.state === STATE.MATCH_END) this._drawMatchEnd();
        if (
            this.state === STATE.SERVING ||
            this.state === STATE.RALLYING ||
            this.state === STATE.POINT_END
        ) {
            this._drawMuteButton(ctx);
        }
    }

    _drawHUD() {
        const ctx = this.ctx;
        ctx.fillStyle = COLORS.hud;
        ctx.fillRect(0, 0, W, 26);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(0, 25, W, 1);

        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = "left";
        ctx.fillStyle = COLORS.player;
        ctx.fillText("YOU", 6, 11);
        ctx.textAlign = "right";
        ctx.fillStyle = COLORS.cpu;
        ctx.fillText("CPU", W - 6, 11);

        const [a, b] = this.score.pointDisplay();
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.fillText(a + "-" + b, W / 2, 11);

        ctx.fillStyle = COLORS.ball;
        ctx.fillText("1 GAME MATCH", W / 2, 22);

        ctx.fillStyle = COLORS.ball;
        if (this.score.serverIdx === 0) ctx.fillRect(34, 8, 3, 3);
        else ctx.fillRect(W - 37, 8, 3, 3);
    }

    _drawServeHint() {
        if (this.timer > 50) return;
        if (Math.floor(this.frame / 12) % 2) return;
        const ctx = this.ctx;
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(W / 2 - 60, 28, 120, 18);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(W / 2 - 60, 28, 120, 1);
        ctx.fillRect(W / 2 - 60, 45, 120, 1);
        ctx.font = '8px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = COLORS.accent;
        const txt = this.score.serverIdx === 0 ? "YOUR SERVE" : "CPU SERVE";
        ctx.fillText(txt, W / 2, 40);
    }

    _drawPointEnd() {
        const ctx = this.ctx;
        ctx.fillStyle = "rgba(0,0,0,0.65)";
        ctx.fillRect(0, 180, W, 32);
        ctx.fillStyle = COLORS.accent;
        ctx.fillRect(0, 180, W, 1);
        ctx.fillRect(0, 211, W, 1);

        ctx.font = '12px "Press Start 2P", monospace';
        ctx.textAlign = "center";
        ctx.fillStyle = this.lastWinner === 0 ? COLORS.player : COLORS.cpu;
        ctx.fillText(this.lastWinner === 0 ? "POINT YOU" : "POINT CPU", W / 2, 201);
    }

    _drawMatchEnd() {
        const ctx = this.ctx;
        ctx.fillStyle = "rgba(0,0,0,0.88)";
        ctx.fillRect(0, 0, W, H);

        ctx.textAlign = "center";
        ctx.font = '20px "Press Start 2P", monospace';
        ctx.fillStyle = "#000";
        ctx.fillText("GAME", W / 2 + 2, 100);
        ctx.fillText("OVER", W / 2 + 2, 130);
        ctx.fillStyle = COLORS.accent;
        ctx.fillText("GAME", W / 2, 98);
        ctx.fillText("OVER", W / 2, 128);

        ctx.font = '12px "Press Start 2P", monospace';
        ctx.fillStyle = this.score.winner === 0 ? COLORS.player : COLORS.cpu;
        ctx.fillText(this.score.winner === 0 ? "YOU WIN!" : "CPU WINS", W / 2, 174);

        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = "#fff";
        ctx.fillText(this.score.winner === 0 ? "GOOD GAME" : "TRY AGAIN", W / 2, 200);

        const tx = W / 2,
            ty = 252;
        ctx.fillStyle = this.score.winner === 0 ? COLORS.accent : COLORS.cpuAlt;
        ctx.fillRect(tx - 14, ty - 16, 28, 14);
        ctx.fillRect(tx - 8, ty - 2, 16, 4);
        ctx.fillRect(tx - 16, ty + 2, 32, 3);
        ctx.fillRect(tx - 22, ty - 14, 6, 10);
        ctx.fillRect(tx + 16, ty - 14, 6, 10);
        ctx.fillStyle = "#fff";
        ctx.fillRect(tx - 4, ty - 12, 8, 8);

        if (Math.floor(this.frame / 24) % 2 === 0) {
            ctx.fillStyle = COLORS.accent;
            ctx.font = '8px "Press Start 2P", monospace';
            ctx.fillText("PLAY AGAIN?", W / 2, 308);
        }

        this._drawSplashStartButton(ctx);
        this._drawMuteButton(ctx);
    }

    _drawSplash() {
        const ctx = this.ctx;

        ctx.fillStyle = COLORS.skyHigh;
        ctx.fillRect(0, 0, W, 26);
        ctx.fillStyle = COLORS.sky;
        ctx.fillRect(0, 26, W, 174);

        const farSpeed = 0.06;
        const nearSpeed = 0.18;
        const farOffset = (this.frame * farSpeed) % (W + 40);
        const nearOffset = (this.frame * nearSpeed) % (W + 40);

        const farClouds = [
            { sprite: CLOUD.tiny, baseX: 10, y: 4 },
            { sprite: CLOUD.small, baseX: 90, y: 12 },
            { sprite: CLOUD.tiny, baseX: 160, y: 2 },
            { sprite: CLOUD.small, baseX: 220, y: 8 }
        ];
        const nearClouds = [
            { sprite: CLOUD.big, baseX: 20, y: 22 },
            { sprite: CLOUD.small, baseX: 130, y: 32 },
            { sprite: CLOUD.big, baseX: 220, y: 18 }
        ];

        farClouds.forEach((c) => {
            const w = c.sprite[0].length;
            let x = c.baseX - farOffset;
            while (x < -w) x += W + 40;
            drawSprite(ctx, c.sprite, Math.round(x), c.y, "#e8eef5");
        });
        nearClouds.forEach((c) => {
            const w = c.sprite[0].length;
            let x = c.baseX - nearOffset;
            while (x < -w) x += W + 40;
            drawSprite(ctx, c.sprite, Math.round(x), c.y, "#ffffff");
        });

        const stadiumTop = 200;
        ctx.fillStyle = COLORS.stadium;
        ctx.fillRect(0, stadiumTop, W, 4);
        this.court.drawCrowdLayer(ctx, this.frame, stadiumTop - 48);
        ctx.fillStyle = COLORS.railing;
        ctx.fillRect(0, stadiumTop + 46, W, 6);
        ctx.fillStyle = "#241410";
        ctx.fillRect(0, stadiumTop + 52, W, 4);

        const sc = {
            nearY: 384,
            farY: 260,
            nearLeftX: 8,
            nearRightX: 212,
            farLeftX: 64,
            farRightX: 156
        };
        const sCourt = (cx, cy) => {
            const lx = sc.nearLeftX + (sc.farLeftX - sc.nearLeftX) * cy;
            const rx = sc.nearRightX + (sc.farRightX - sc.nearRightX) * cy;
            return {
                sx: lx + (rx - lx) * (cx + 1) * 0.5,
                sy: sc.nearY + (sc.farY - sc.nearY) * cy
            };
        };

        ctx.fillStyle = COLORS.courtDark;
        ctx.fillRect(0, stadiumTop + 56, W, H - stadiumTop - 56);

        ctx.fillStyle = COLORS.courtA;
        ctx.beginPath();
        let p = sCourt(-1.3, 0);
        ctx.moveTo(p.sx, p.sy);
        p = sCourt(1.3, 0);
        ctx.lineTo(p.sx, p.sy);
        p = sCourt(1.3, 1);
        ctx.lineTo(p.sx, p.sy);
        p = sCourt(-1.3, 1);
        ctx.lineTo(p.sx, p.sy);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        const drawLine = (x1, y1, x2, y2) => {
            const a = sCourt(x1, y1),
                b = sCourt(x2, y2);
            ctx.beginPath();
            ctx.moveTo(a.sx + 0.5, a.sy + 0.5);
            ctx.lineTo(b.sx + 0.5, b.sy + 0.5);
            ctx.stroke();
        };
        drawLine(-1.3, 0, 1.3, 0);
        drawLine(-1.3, 1, 1.3, 1);
        drawLine(-1.3, 0, -1.3, 1);
        drawLine(1.3, 0, 1.3, 1);
        drawLine(-1.0, 0, -1.0, 1);
        drawLine(1.0, 0, 1.0, 1);
        drawLine(-1.0, 0.25, 1.0, 0.25);
        drawLine(-1.0, 0.75, 1.0, 0.75);
        drawLine(0, 0.25, 0, 0.75);
        drawLine(-0.05, 0, 0.05, 0);
        drawLine(-0.05, 1, 0.05, 1);

        const netL = sCourt(-1.4, 0.5);
        const netR = sCourt(1.4, 0.5);
        const netH = 12;
        ctx.fillStyle = COLORS.netDark;
        ctx.fillRect(netL.sx, netL.sy - netH, netR.sx - netL.sx, netH);
        ctx.fillStyle = "#fff";
        ctx.fillRect(netL.sx, netL.sy - netH, netR.sx - netL.sx, 2);

        ctx.textAlign = "center";
        ctx.font = '32px "Press Start 2P", monospace';
        ctx.fillStyle = "#000";
        ctx.fillText("MATCH", W / 2 + 3, 84);
        ctx.fillStyle = COLORS.playerAlt;
        ctx.fillText("MATCH", W / 2 + 1, 82);
        ctx.fillStyle = COLORS.accent;
        ctx.fillText("MATCH", W / 2, 80);

        ctx.font = '8px "Press Start 2P", monospace';
        ctx.fillStyle = "#000";
        ctx.fillText("8-BIT TENNIS", W / 2 + 1, 103);
        ctx.fillStyle = "#fff";
        ctx.fillText("8-BIT TENNIS", W / 2, 102);

        ctx.fillStyle = "#000";
        ctx.fillText("HOW TO HIT", W / 2 + 1, 131);
        ctx.fillStyle = COLORS.ball;
        ctx.fillText("HOW TO HIT", W / 2, 130);

        ctx.fillStyle = "#000";
        ctx.fillText("MOBILE  SWIPE", W / 2 + 1, 149);
        ctx.fillStyle = COLORS.player;
        ctx.fillText("MOBILE  SWIPE", W / 2, 148);

        drawSprite(ctx, ARROW.NW, 64, 158, "#000");
        drawSprite(ctx, ARROW.NW, 63, 157, "#fff");
        drawSprite(ctx, ARROW.N, 106, 158, "#000");
        drawSprite(ctx, ARROW.N, 105, 157, "#fff");
        drawSprite(ctx, ARROW.NE, 148, 158, "#000");
        drawSprite(ctx, ARROW.NE, 147, 157, "#fff");

        ctx.fillStyle = "#000";
        ctx.fillText("KEYBOARD  \u2190 \u2191 \u2192", W / 2 + 1, 181);
        ctx.fillStyle = COLORS.cpu;
        ctx.fillText("KEYBOARD  \u2190 \u2191 \u2192", W / 2, 180);

        this._drawSplashSoundButton(ctx);
        this._drawSplashStartButton(ctx);
    }
}

// ============================================================================
//  BOOT
// ============================================================================
function start() {
    new Game(document.getElementById("game"));
}
if (document.fonts && document.fonts.ready) {
    let started = false;
    const fire = () => {
        if (!started) {
            started = true;
            start();
        }
    };
    document.fonts.ready.then(fire);
    setTimeout(fire, 1500);
} else {
    window.addEventListener("load", start);
}