import Phaser from "phaser";

export class StarterScene extends Phaser.Scene {
  constructor() {
    super("Starter");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Vælg din starter (kommer snart)", {
        fontFamily: "sans-serif",
        fontSize: "32px",
        color: "#ffffff",
      })
      .setOrigin(0.5);
  }
}
