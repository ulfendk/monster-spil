import Phaser from "phaser";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
    const { width, height } = this.scale;

    this.add
      .text(width / 2, height / 2, "Monsterjagt", {
        fontFamily: "sans-serif",
        fontSize: "64px",
        color: "#ffce54",
      })
      .setOrigin(0.5);
  }
}
