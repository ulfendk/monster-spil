import Phaser from "phaser";

/** A finger that moves further than this (px) is scrolling, not tapping. */
const TAP_SLOP = 10;

export interface Scrolling {
  /** Whether the touch going on now is a drag (or stopped a glide), so it's no tap. */
  readonly dragging: boolean;
}

/**
 * Scrolling that feels like a phone's, for a camera showing a long list (the monster book, the
 * badge wall): the list follows the finger, glides on after a flick and slows down, stretches a
 * little past either end and springs back. A touch stops a glide (and that touch taps nothing);
 * a drag never taps. `within` limits which touches scroll (default: all of them).
 */
export function addScrolling(
  scene: Phaser.Scene,
  camera: Phaser.Cameras.Scene2D.Camera,
  maxScroll: number,
  within: (p: Phaser.Input.Pointer) => boolean = () => true,
): Scrolling {
  let scroll: { y: number; from: number; moved: boolean; lastY: number; lastT: number } | undefined;
  /** How fast the list glides after a flick (px per ms; positive = down the list). */
  let velocity = 0;
  camera.setScroll(camera.scrollX, 0);

  /** Past either end the list only follows the finger a third of the way: it stretches. */
  const stretched = (y: number) => (y < 0 ? y / 3 : y > maxScroll ? maxScroll + (y - maxScroll) / 3 : y);

  scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
    if (!within(p)) return;
    const gliding = Math.abs(velocity) > 0.05;
    velocity = 0;
    scroll = { y: p.y, from: camera.scrollY, moved: gliding, lastY: p.y, lastT: performance.now() };
  });
  scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
    const s = scroll;
    if (!s || !p.isDown) return;
    if (!s.moved && Math.abs(p.y - s.y) > TAP_SLOP) {
      // Start from here, so the list doesn't jump by the slop.
      s.moved = true;
      s.y = p.y;
      s.from = camera.scrollY;
    }
    if (!s.moved) return;
    camera.setScroll(camera.scrollX, stretched(s.from - (p.y - s.y)));
    const now = performance.now();
    const dt = Math.max(1, now - s.lastT);
    // The finger's speed, smoothed a little: that's what a flick carries on with.
    velocity = 0.7 * ((s.lastY - p.y) / dt) + 0.3 * velocity;
    s.lastY = p.y;
    s.lastT = now;
  });
  scene.input.on("pointerup", () => {
    const s = scroll;
    // A finger that stopped before lifting doesn't flick.
    if (!s?.moved || performance.now() - s.lastT > 80) velocity = 0;
    // A tap on something is handled first (pointerup on it); forget the drag afterwards.
    scene.time.delayedCall(0, () => (scroll = undefined));
  });
  scene.input.on("wheel", (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
    if (within(p)) camera.setScroll(camera.scrollX, Phaser.Math.Clamp(camera.scrollY + dy, 0, maxScroll));
  });

  const update = (_time: number, delta: number) => {
    if (scroll?.moved && scene.input.activePointer.isDown) return; // the finger has it
    let y = camera.scrollY;
    if (Math.abs(velocity) > 0.01) {
      y += velocity * delta;
      // Slowing down like a phone's list (about a third of a second to lose most speed);
      // much faster once it's run past an end.
      const outside = y < 0 || y > maxScroll;
      velocity *= Math.exp(-delta / (outside ? 45 : 325));
    } else {
      velocity = 0;
    }
    // Past an end: spring back.
    const target = Phaser.Math.Clamp(y, 0, maxScroll);
    if (y !== target) y += (target - y) * (1 - Math.exp(-delta / 90));
    if (Math.abs(y - target) < 0.5 && Math.abs(velocity) <= 0.01) y = target;
    if (y !== camera.scrollY) camera.setScroll(camera.scrollX, y);
  };
  scene.events.on(Phaser.Scenes.Events.UPDATE, update);
  // (The input listeners go with the scene's input on shutdown; this one must be taken off by hand.)
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, update));

  return {
    get dragging() {
      return !!scroll?.moved;
    },
  };
}
