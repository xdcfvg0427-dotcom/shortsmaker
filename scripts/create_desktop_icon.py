"""Draw a simple application icon from geometric shapes, without external artwork."""
from pathlib import Path
from PIL import Image, ImageDraw

image = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((4, 4, 252, 252), radius=52, fill="#365b47")
draw.rounded_rectangle((55, 34, 201, 222), radius=19, fill="#fff9eb")
draw.line((81, 63, 175, 63), fill="#c9d8bf", width=9)
draw.line((81, 86, 150, 86), fill="#c9d8bf", width=9)
draw.polygon([(103, 110), (103, 186), (163, 148)], fill="#dca366")
target = Path(__file__).resolve().parents[1] / "apps/desktop/icon.ico"
image.save(target, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
