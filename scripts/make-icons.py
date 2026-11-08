"""Draws the toolbar icons (no dependencies): a rounded square with text lines, one highlighted."""
import struct, zlib, sys, os

def png(size, path):
    s = size
    px = []
    r = s * 0.22
    for y in range(s):
        row = []
        for x in range(s):
            # rounded-square mask with 2x2 supersampling
            cover = 0
            for sx in (0.25, 0.75):
                for sy in (0.25, 0.75):
                    fx, fy = x + sx, y + sy
                    cx = min(max(fx, r), s - r); cy = min(max(fy, r), s - r)
                    if (fx - cx) ** 2 + (fy - cy) ** 2 <= r * r: cover += 1
            a = int(255 * cover / 4)
            col = (31, 95, 191)
            u, v = x / s, y / s
            for i, ly in enumerate((0.28, 0.47, 0.66)):
                if ly <= v <= ly + 0.11 and 0.2 <= u <= (0.8 if i != 2 else 0.6):
                    col = (255, 216, 77) if i == 1 else (255, 255, 255)
            row.append(bytes((*col, a)))
        px.append(b'\x00' + b''.join(row))
    raw = zlib.compress(b''.join(px), 9)
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', s, s, 8, 6, 0, 0, 0)) + chunk(b'IDAT', raw) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)

out = sys.argv[1]
for n in (16, 32, 48, 128):
    png(n, os.path.join(out, f'icon{n}.png'))
