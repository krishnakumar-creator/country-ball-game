import Matter from 'matter-js';
import confetti from 'canvas-confetti';
import { sound } from './audio.js';

const { Engine, World, Bodies, Body, Vector, Events } = Matter;

export class BattleRoyaleGame {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.options = Object.assign({
      arenaRadius: 280,
      ringSegments: 48,
      holeAngleSize: 0.38, // Calibrated ~22° opening (~85-105px wide) for smooth, natural ~1 min matches
      rotationSpeed: 0.013, // Calibrated rotation (~7.5s per revolution, ~8 sweeps per minute)
      gravityY: 0.58,
      ballRadius: 18,
      speedMultiplier: 1.0,
      gameMode: 'classic', // 'classic', 'dual', 'shrinking', 'hexagon'
      onElimination: () => {},
      onWinner: () => {},
      onCountChange: () => {},
      onTop5Alert: () => {},
    }, options);

    this.engine = null;
    this.world = null;
    this.balls = [];
    this.wallSegments = [];
    this.innerWallSegments = [];
    this.particles = [];
    this.eliminated = [];
    this.activeContenders = [];
    this.totalCount = 0;

    this.isRunning = false;
    this.isPaused = false;
    this.isGameOver = false;
    this.isWaitingToStart = true; // Waiting for streamer to click Start button
    this.matchElapsedTime = 0;
    this.lastEliminationTime = 0;

    this.ringAngle = 0;
    this.innerRingAngle = 0;
    this.center = { x: 0, y: 0 };
    this.currentRadius = this.options.arenaRadius;
    this.dropZoneTimer = 0;

    this.flagImages = new Map();
    this.animId = null;
    this.lastTime = performance.now();
    this.heartbeatTimer = 0;
    this.top5Triggered = false;

    this.resize();
  }

  calculateBallRadius() {
    const count = Math.max(1, this.totalCount || (this.activeContenders && this.activeContenders.length) || 50);
    // Area of circular arena
    const arenaArea = Math.PI * this.currentRadius * this.currentRadius;
    // Keep total ball area under ~18-20% of arena so balls never get crowded or shoot out
    const targetBallFraction = 0.19;
    const maxAreaPerBall = (arenaArea * targetBallFraction) / count;
    const calculatedR = Math.floor(Math.sqrt(maxAreaPerBall / Math.PI));
    // Safe clamp between 9px (for 120+ countries or small circles) and 19px (for small counts)
    this.options.ballRadius = Math.min(19, Math.max(9, calculatedR));
    return this.options.ballRadius;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width || window.innerWidth;
    this.height = rect.height || window.innerHeight;

    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    // Center arena in the dedicated arena canvas area
    this.center = {
      x: this.width * 0.5,
      y: this.height * 0.5
    };

    // Responsive radius fitting comfortably within canvas boundaries
    const minDimension = Math.min(this.width, this.height);
    const maxRadius = Math.floor(minDimension * 0.43);
    this.options.arenaRadius = Math.max(110, maxRadius);
    this.currentRadius = this.options.arenaRadius;

    this.calculateBallRadius();
  }

  preloadFlag(code) {
    if (!code || this.flagImages.has(code)) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = `https://flagcdn.com/w80/${code.toLowerCase()}.png`;
    img.onload = () => {
      this.flagImages.set(code, img);
    };
    img.onerror = () => {
      this.flagImages.set(code, null); // Marked as fallback
    };
  }

  init(contendersList, autoStart = false) {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }

    if (this.engine) {
      World.clear(this.engine.world);
      Engine.clear(this.engine);
    }

    // High solver iterations for 100% collision accuracy & zero wall tunneling
    this.engine = Engine.create({
      gravity: { x: 0, y: this.options.gravityY, scale: 0.001 },
      positionIterations: 10,
      velocityIterations: 10
    });
    this.world = this.engine.world;

    this.balls = [];
    this.wallSegments = [];
    this.innerWallSegments = [];
    this.particles = [];
    this.eliminated = [];
    this.activeContenders = [...contendersList];
    this.totalCount = contendersList.length;
    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.top5Triggered = false;
    this.isWaitingToStart = !autoStart;
    this.matchElapsedTime = 0;
    this.lastEliminationTime = 0;
    this.recentElimCount = 0;
    this.currentRadius = this.options.arenaRadius;
    this.ringAngle = 0;
    this.innerRingAngle = 0;

    // Dynamically scale ball radius based on contender count and arena radius
    this.calculateBallRadius();

    // Preload flags
    this.activeContenders.forEach(c => {
      if (c.code) this.preloadFlag(c.code);
    });

    this.createArena();
    this.setupCollisions();

    if (autoStart) {
      this.startRound();
    } else {
      // Spawn suspended preview balls at top inside
      this.spawnPreviewBalls();
    }

    this.options.onCountChange(this.balls.length, this.totalCount);

    this.lastTime = performance.now();
    this.loop = this.loop.bind(this);
    this.animId = requestAnimationFrame(this.loop);
  }

  startRound() {
    this.isWaitingToStart = false;
    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.matchElapsedTime = 0;
    this.lastEliminationTime = 0;
    this.recentElimCount = 0;
    this.top5Triggered = false;

    // Clear preview balls if present and spawn dynamic dropping balls
    if (this.balls.length > 0) {
      World.remove(this.world, this.balls);
      this.balls = [];
    }

    this.spawnBalls();
    this.options.onCountChange(this.balls.length, this.totalCount);
  }

  createArena() {
    // Clear previous segments
    if (this.wallSegments.length > 0) {
      World.remove(this.world, this.wallSegments);
      this.wallSegments = [];
    }
    if (this.innerWallSegments.length > 0) {
      World.remove(this.world, this.innerWallSegments);
      this.innerWallSegments = [];
    }

    if (this.options.gameMode === 'hexagon') {
      this.createHexagonArena();
      return;
    }

    const segments = this.options.ringSegments;
    const radius = this.currentRadius;
    const thickness = 36;
    const step = (Math.PI * 2) / segments;
    const holeSize = this.options.holeAngleSize;
    // Hole starts at the TOP (-Math.PI / 2, or 1.5 * Math.PI) so bottom is 100% solid
    const holeCenterAngle = Math.PI * 1.5;

    for (let i = 0; i < segments; i++) {
      const angle = i * step;

      let normalizedAngle = (angle % (Math.PI * 2));
      if (normalizedAngle < 0) normalizedAngle += Math.PI * 2;

      let angleDiff = Math.abs(normalizedAngle - holeCenterAngle);
      if (angleDiff > Math.PI) angleDiff = (Math.PI * 2) - angleDiff;

      const isInHole = angleDiff < (holeSize / 2);
      if (isInHole) continue;

      const x = this.center.x + Math.cos(angle) * radius;
      const y = this.center.y + Math.sin(angle) * radius;
      const length = (2 * Math.PI * radius) / segments * 1.35;

      const segment = Bodies.rectangle(x, y, length, thickness, {
        isStatic: true,
        angle: angle + Math.PI / 2,
        restitution: 0.9,
        friction: 0.05,
        render: { visible: false },
        label: 'wall'
      });
      segment.baseAngle = angle;
      this.wallSegments.push(segment);
    }

    World.add(this.world, this.wallSegments);

    // If dual mode, add an inner counter-rotating ring with hole opposite
    if (this.options.gameMode === 'dual') {
      const innerRadius = radius * 0.55;
      const innerSegments = 32;
      const innerStep = (Math.PI * 2) / innerSegments;
      const innerHoleCenter = Math.PI * 0.5;

      for (let i = 0; i < innerSegments; i++) {
        const angle = i * innerStep;
        let norm = angle % (Math.PI * 2);
        if (norm < 0) norm += Math.PI * 2;
        let diff = Math.abs(norm - innerHoleCenter);
        if (diff > Math.PI) diff = (Math.PI * 2) - diff;
        if (diff < holeSize / 2) continue;

        const x = this.center.x + Math.cos(angle) * innerRadius;
        const y = this.center.y + Math.sin(angle) * innerRadius;
        const length = (2 * Math.PI * innerRadius) / innerSegments * 1.35;

        const seg = Bodies.rectangle(x, y, length, thickness * 0.8, {
          isStatic: true,
          angle: angle + Math.PI / 2,
          restitution: 0.85,
          friction: 0.05,
          label: 'innerWall'
        });
        seg.baseAngle = angle;
        this.innerWallSegments.push(seg);
      }
      World.add(this.world, this.innerWallSegments);
    }
  }

  createHexagonArena() {
    const sides = 6;
    const radius = this.currentRadius;
    const thickness = 36;
    const step = (Math.PI * 2) / sides;
    const sideLen = radius * 1.18;

    for (let i = 0; i < sides; i++) {
      if (i === 4) continue; // Side 4 (top-left) is the escape exit, so bottom sides are solid!

      const angle = i * step;
      const x = this.center.x + Math.cos(angle) * radius;
      const y = this.center.y + Math.sin(angle) * radius;

      const seg = Bodies.rectangle(x, y, sideLen, thickness, {
        isStatic: true,
        angle: angle + Math.PI / 2,
        restitution: 0.95,
        friction: 0.05,
        label: 'wall'
      });
      seg.baseAngle = angle;
      this.wallSegments.push(seg);
    }
    World.add(this.world, this.wallSegments);
  }

  spawnPreviewBalls() {
    const ballR = this.options.ballRadius;
    const count = this.activeContenders.length;

    let currentCount = 0;
    let rowIndex = 0;
    const rowStep = ballR * 2.25;
    const startY = this.center.y - (this.currentRadius * 0.72);

    while (currentCount < count) {
      const y = startY + (rowIndex * rowStep);
      const dy = y - this.center.y;
      const maxAllowedDist = this.currentRadius - ballR * 2.3;
      const widthAtY = Math.sqrt(Math.max(0, (maxAllowedDist * maxAllowedDist) - (dy * dy)));
      const safeHalfSpan = Math.max(ballR, widthAtY * 0.86);

      const ballSpan = ballR * 2.25;
      const ballsInRow = Math.max(1, Math.floor((safeHalfSpan * 2) / ballSpan));

      for (let c = 0; c < ballsInRow && currentCount < count; c++) {
        const contender = this.activeContenders[currentCount];
        const frac = ballsInRow === 1 ? 0.5 : c / (ballsInRow - 1);
        const xOffset = (frac - 0.5) * (safeHalfSpan * 2);

        const x = this.center.x + xOffset;
        const finalY = y;

        const body = Bodies.circle(x, finalY, ballR, {
          isStatic: true, // Suspended preview before match starts
          restitution: 0.88,
          friction: 0.02,
          density: 0.002,
          label: 'ball'
        });

        body.contender = contender;
        body.isEliminated = false;
        body.survivalTime = 0;

        this.balls.push(body);
        currentCount++;
      }
      rowIndex++;
    }

    World.add(this.world, this.balls);
  }

  spawnBalls() {
    const ballR = this.options.ballRadius;
    const count = this.activeContenders.length;

    // Trigger satisfying drop audio
    sound.playDrop();
    this.dropZoneTimer = 2.5;

    // Drop all balls from the top inside of the circle
    let currentCount = 0;
    let rowIndex = 0;
    const rowStep = ballR * 2.25;
    const startY = this.center.y - (this.currentRadius * 0.72);

    while (currentCount < count) {
      const y = startY + (rowIndex * rowStep);
      const dy = y - this.center.y;

      const maxAllowedDist = this.currentRadius - ballR * 2.3;
      const widthAtY = Math.sqrt(Math.max(0, (maxAllowedDist * maxAllowedDist) - (dy * dy)));
      const safeHalfSpan = Math.max(ballR, widthAtY * 0.86);

      const ballSpan = ballR * 2.25;
      const ballsInRow = Math.max(1, Math.floor((safeHalfSpan * 2) / ballSpan));

      for (let c = 0; c < ballsInRow && currentCount < count; c++) {
        const contender = this.activeContenders[currentCount];
        const frac = ballsInRow === 1 ? 0.5 : c / (ballsInRow - 1);
        const xOffset = (frac - 0.5) * (safeHalfSpan * 2);
        const jitterX = (Math.random() - 0.5) * (ballR * 0.35);
        const jitterY = (Math.random() - 0.5) * (ballR * 0.35);

        let x = this.center.x + xOffset + jitterX;
        let finalY = y + jitterY;

        const finalDx = x - this.center.x;
        const finalDy = finalY - this.center.y;
        const currentDist = Math.hypot(finalDx, finalDy);
        if (currentDist > maxAllowedDist) {
          x = this.center.x + (finalDx / currentDist) * maxAllowedDist;
          finalY = this.center.y + (finalDy / currentDist) * maxAllowedDist;
        }

        const body = Bodies.circle(x, finalY, ballR, {
          restitution: 0.88,
          friction: 0.02,
          frictionAir: 0.003,
          density: 0.002,
          label: 'ball'
        });

        // Dynamic downward drop impulse from top inside circle
        const dropVx = (Math.random() - 0.5) * 1.5;
        const dropVy = 2.4 + Math.random() * 2.8;
        Body.setVelocity(body, { x: dropVx, y: dropVy });

        body.contender = contender;
        body.isEliminated = false;
        body.survivalTime = 0;

        this.balls.push(body);
        currentCount++;
      }
      rowIndex++;
    }

    World.add(this.world, this.balls);
  }

  setupCollisions() {
    Events.on(this.engine, 'collisionStart', (evt) => {
      const pairs = evt.pairs;
      for (let i = 0; i < pairs.length; i++) {
        const p = pairs[i];
        if (p.bodyA.label === 'ball' || p.bodyB.label === 'ball') {
          const speed = Vector.magnitude(Vector.sub(p.bodyA.velocity, p.bodyB.velocity));
          if (speed > 1.5) {
            sound.playBounce(Math.min(1.0, speed / 12));
          }
        }
      }
    });
  }

  updatePhysics(dt) {
    if (!this.isRunning || this.isPaused || this.isGameOver || this.isWaitingToStart) return;

    let effectiveDt = dt * this.options.speedMultiplier;
    this.matchElapsedTime += effectiveDt / 1000;

    // Slow motion when down to 3 or 2 balls for ultimate suspense!
    if (this.balls.length <= 3 && this.balls.length > 1) {
      effectiveDt *= 0.6;
      this.heartbeatTimer += dt;
      if (this.heartbeatTimer > 600) {
        sound.playHeartbeat();
        this.heartbeatTimer = 0;
      }
    }

    if (this.dropZoneTimer > 0) {
      this.dropZoneTimer = Math.max(0, this.dropZoneTimer - (effectiveDt / 1000));
    }

    if (this.balls.length <= 5 && !this.top5Triggered && this.totalCount > 10) {
      this.top5Triggered = true;
      sound.playTop5Alert();
      this.options.onTop5Alert();
    }

    // Shrinking storm mode logic
    if (this.options.gameMode === 'shrinking' && this.currentRadius > 130) {
      this.currentRadius -= 0.015 * effectiveDt;
    }

    // Dynamic rotation pacing: gently accelerate after 45s if still many balls remaining
    let rotSpeed = this.options.rotationSpeed;
    if (this.matchElapsedTime > 45 && this.balls.length > 6) {
      rotSpeed *= 1.35; // Paces round nicely for ~60s completion
    }

    // Rotate arena walls
    this.ringAngle += rotSpeed * (effectiveDt / 16.6);
    this.innerRingAngle -= (rotSpeed * 1.3) * (effectiveDt / 16.6);

    const radius = this.currentRadius;

    for (let i = 0; i < this.wallSegments.length; i++) {
      const seg = this.wallSegments[i];
      const angle = seg.baseAngle + this.ringAngle;
      const x = this.center.x + Math.cos(angle) * radius;
      const y = this.center.y + Math.sin(angle) * radius;

      Body.setPosition(seg, { x, y });
      Body.setAngle(seg, angle + Math.PI / 2);
    }

    if (this.innerWallSegments.length > 0) {
      const innerRadius = radius * 0.55;
      for (let i = 0; i < this.innerWallSegments.length; i++) {
        const seg = this.innerWallSegments[i];
        const angle = seg.baseAngle + this.innerRingAngle;
        const x = this.center.x + Math.cos(angle) * innerRadius;
        const y = this.center.y + Math.sin(angle) * innerRadius;

        Body.setPosition(seg, { x, y });
        Body.setAngle(seg, angle + Math.PI / 2);
      }
    }

    // Velocity capping: prevent extreme physics tunneling
    const maxSpeed = 17;
    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const spd = Vector.magnitude(b.velocity);
      if (spd > maxSpeed) {
        Body.setVelocity(b, {
          x: (b.velocity.x / spd) * maxSpeed,
          y: (b.velocity.y / spd) * maxSpeed
        });
      }
    }

    // Step physics engine
    Engine.update(this.engine, effectiveDt);

    // Airtight containment and hole-escape checking
    // Hole starts at the TOP (-Math.PI / 2) and rotates by ringAngle
    const currentHoleAngle = this.ringAngle - (Math.PI / 2);
    const holeHalfSize = (this.options.gameMode === 'hexagon')
      ? (Math.PI / 6)
      : (this.options.holeAngleSize / 2);

    const ballR = this.options.ballRadius;
    const innerBoundary = this.currentRadius - ballR;
    const surviving = [];
    const now = performance.now();

    for (let i = 0; i < this.balls.length; i++) {
      const b = this.balls[i];
      const dx = b.position.x - this.center.x;
      const dy = b.position.y - this.center.y;
      const dist = Math.hypot(dx, dy);
      const ballAngle = Math.atan2(dy, dx);

      // Angular difference between ball position and hole center
      let angleDiff = (ballAngle - currentHoleAngle) % (Math.PI * 2);
      if (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      if (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      const absAngleDiff = Math.abs(angleDiff);

      const isInHoleOpening = absAngleDiff <= holeHalfSize * 0.98;

      if (isInHoleOpening) {
        if (dist > this.currentRadius + ballR * 0.35 && !b.isEliminated) {
          b.isEliminated = true;
          this.lastEliminationTime = now;
          this.handleElimination(b);
          World.remove(this.world, b);
          continue;
        }
      } else {
        // Ball is facing SOLID wall. If it pushes too far or glitches:
        if (dist > innerBoundary - 0.5) {
          const safeDist = innerBoundary - 2;
          Body.setPosition(b, {
            x: this.center.x + Math.cos(ballAngle) * safeDist,
            y: this.center.y + Math.sin(ballAngle) * safeDist
          });

          // Reflect radial velocity inward
          const nx = Math.cos(ballAngle);
          const ny = Math.sin(ballAngle);
          const radialDot = b.velocity.x * nx + b.velocity.y * ny;
          if (radialDot > 0) {
            Body.setVelocity(b, {
              x: (b.velocity.x - 1.85 * radialDot * nx) * 0.88,
              y: (b.velocity.y - 1.85 * radialDot * ny) * 0.88
            });
          }
        }
      }

      surviving.push(b);
    }

    this.balls = surviving;

    // Check winner!
    if (this.balls.length === 1 && !this.isGameOver) {
      this.isGameOver = true;
      this.handleWinner(this.balls[0]);
    }

    // Update particle effects
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.alpha -= p.decay;
      if (p.alpha <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  handleElimination(ball) {
    const placement = this.balls.length;
    const record = {
      contender: ball.contender,
      placement: placement,
      time: (this.matchElapsedTime || 0).toFixed(1)
    };

    this.eliminated.unshift(record);
    sound.playElimination();

    // Spawn elimination shockwave particles
    for (let i = 0; i < 20; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 2 + Math.random() * 5;
      this.particles.push({
        x: ball.position.x,
        y: ball.position.y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        color: '#ff4757',
        size: 3 + Math.random() * 4,
        alpha: 1.0,
        decay: 0.03
      });
    }

    this.options.onElimination(record);
    this.options.onCountChange(this.balls.length - 1, this.totalCount);
  }

  handleWinner(winnerBall) {
    sound.playVictory();
    confetti({
      particleCount: 150,
      spread: 90,
      origin: { y: 0.6 }
    });

    const winnerData = {
      contender: winnerBall.contender,
      totalContenders: this.totalCount
    };

    this.options.onWinner(winnerData);
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Draw background arena ambiance
    this.drawBackground(ctx);

    // Draw arena boundaries
    this.drawArena(ctx);

    // Draw balls / flags
    this.drawBalls(ctx);

    // Draw particles
    this.drawParticles(ctx);

    // Draw center indicator / vortex pulse
    this.drawCenterAura(ctx);
  }

  drawBackground(ctx) {
    // Subtle cyber grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.lineWidth = 1;
    const gridStep = 40;
    for (let x = 0; x < this.width; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    for (let y = 0; y < this.height; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }

    // Center gradient spotlight
    const grad = ctx.createRadialGradient(
      this.center.x, this.center.y, 10,
      this.center.x, this.center.y, this.currentRadius * 1.5
    );
    grad.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
    grad.addColorStop(0.7, 'rgba(129, 140, 248, 0.03)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, this.currentRadius * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCenterAura(ctx) {
    // Clean, unobstructed arena floor with subtle ambient cyber reticle
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.center.x, this.center.y, 22, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 5]);
    ctx.stroke();
    ctx.restore();
  }

  drawArena(ctx) {
    ctx.save();

    // Draw outer wall segments with glowing neon stroke
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 12;

    this.wallSegments.forEach(seg => {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      const vertices = seg.vertices;
      ctx.moveTo(vertices[0].x, vertices[0].y);
      for (let j = 1; j < vertices.length; j++) {
        ctx.lineTo(vertices[j].x, vertices[j].y);
      }
      ctx.closePath();
      ctx.fill();
    });

    if (this.innerWallSegments.length > 0) {
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 10;
      this.innerWallSegments.forEach(seg => {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        const vertices = seg.vertices;
        ctx.moveTo(vertices[0].x, vertices[0].y);
        for (let j = 1; j < vertices.length; j++) {
          ctx.lineTo(vertices[j].x, vertices[j].y);
        }
        ctx.closePath();
        ctx.fill();
      });
    }

    // Highlight the "Escape Hole" zone at the TOP with warning glow indicator
    const holeAngle = this.ringAngle - (Math.PI / 2);
    const holeX = this.center.x + Math.cos(holeAngle) * this.currentRadius;
    const holeY = this.center.y + Math.sin(holeAngle) * this.currentRadius;

    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ff0055';
    ctx.beginPath();
    ctx.arc(holeX, holeY, 6, 0, Math.PI * 2);
    ctx.fill();

    // Show Drop Zone hatch indicator at the top of the ring during round start
    if (this.dropZoneTimer > 0) {
      const alpha = Math.min(1.0, this.dropZoneTimer / 1.5);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#00f2fe';
      ctx.strokeStyle = '#00f2fe';
      ctx.shadowColor = '#00f2fe';
      ctx.shadowBlur = 14;

      const topX = this.center.x;
      const topY = this.center.y - this.currentRadius;

      ctx.font = 'bold 12px Rajdhani, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⬇ DROP ZONE ⬇', topX, topY + 28);

      ctx.beginPath();
      ctx.arc(this.center.x, this.center.y, this.currentRadius - 5, -Math.PI * 0.65, -Math.PI * 0.35);
      ctx.lineWidth = 3;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  drawBalls(ctx) {
    const ballR = this.options.ballRadius;

    this.balls.forEach(ball => {
      const { x, y } = ball.position;
      const angle = ball.angle;
      const contender = ball.contender;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);

      // Outer glow for final 3 balls
      if (this.balls.length <= 3) {
        ctx.shadowColor = '#f59e0b';
        ctx.shadowBlur = 18;
      }

      // Ball circle clip
      ctx.beginPath();
      ctx.arc(0, 0, ballR, 0, Math.PI * 2);
      ctx.clip();

      const img = contender.code ? this.flagImages.get(contender.code) : null;
      if (img && img.complete && img.naturalWidth !== 0) {
        // Draw flag
        ctx.drawImage(img, -ballR, -ballR, ballR * 2, ballR * 2);
      } else {
        // Fallback stylish circular badge
        const grad = ctx.createLinearGradient(-ballR, -ballR, ballR, ballR);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = grad;
        ctx.fillRect(-ballR, -ballR, ballR * 2, ballR * 2);

        ctx.fillStyle = '#ffffff';
        const labelSize = Math.max(7, Math.floor(ballR * 0.52));
        ctx.font = `bold ${labelSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = contender.code ? contender.code.toUpperCase() : contender.name.slice(0, 3).toUpperCase();
        ctx.fillText(label, 0, 0);
      }

      // Gloss / 3D highlight reflection
      const shine = ctx.createRadialGradient(-ballR * 0.35, -ballR * 0.35, 1, 0, 0, ballR);
      shine.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.05)');
      shine.addColorStop(1, 'rgba(0, 0, 0, 0.35)');
      ctx.fillStyle = shine;
      ctx.beginPath();
      ctx.arc(0, 0, ballR, 0, Math.PI * 2);
      ctx.fill();

      // Border outline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // Draw floating country name for final 5
      if (this.balls.length <= 5) {
        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px Outfit, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 6;
        ctx.fillText(contender.name, x, y - ballR - 5);
        ctx.restore();
      }
    });
  }

  drawParticles(ctx) {
    this.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  loop(timestamp) {
    const dt = Math.min(32, timestamp - this.lastTime);
    this.lastTime = timestamp;

    this.updatePhysics(dt);
    this.draw();

    if (this.isRunning) {
      this.animId = requestAnimationFrame(this.loop);
    }
  }

  setSpeed(multiplier) {
    this.options.speedMultiplier = multiplier;
  }

  setGameMode(mode) {
    this.options.gameMode = mode;
    this.createArena();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    return this.isPaused;
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
    }
    if (this.engine) {
      World.clear(this.engine.world);
      Engine.clear(this.engine);
    }
  }
}
