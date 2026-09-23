import Phaser from "phaser";

export class SetupScene extends Phaser.Scene {
  constructor() {
    super("Setup");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Opsætning (kommer snart)", {
        fontFamily: "sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }
}
