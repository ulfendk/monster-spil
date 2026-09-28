"""The Kanagawa palette (client/src/ui/theme.ts `KANAGAWA`), for colouring models."""
import colorsys

K = {
    "sumiInk0": 0x16161D,
    "sumiInk4": 0x2A2A37,
    "fujiWhite": 0xDCD7BA,
    "oldWhite": 0xC8C093,
    "fujiGray": 0x727169,
    "autumnRed": 0xC34043,
    "samuraiRed": 0xE82424,
    "waveRed": 0xE46876,
    "peachRed": 0xFF5D62,
    "surimiOrange": 0xFFA066,
    "autumnGreen": 0x76946A,
    "springGreen": 0x98BB6C,
    "crystalBlue": 0x7E9CD8,
    "springBlue": 0x7FB4CA,
    "oniViolet": 0x957FB8,
    "carpYellow": 0xE6C384,
    "boatYellow1": 0x938056,
    "boatYellow2": 0xC0A36E,
    "katanaGray": 0x717C7C,
    "sakuraPink": 0xD27E99,
    "washi": 0xF0E6D2,
}

INK = K["sumiInk0"]


def shade(colour, amount):
    """Lighter (+) or darker (−) by `amount` percent lightness, like `shade` in monster-model.ts."""
    r, g, b = ((colour >> 16) & 255) / 255, ((colour >> 8) & 255) / 255, (colour & 255) / 255
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(h, min(1, max(0, l + amount / 100)), s)
    return (round(r * 255) << 16) | (round(g * 255) << 8) | round(b * 255)


def mix(a, b, t):
    ch = lambda c, s: (c >> s) & 255
    return sum(round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s for s in (16, 8, 0))
