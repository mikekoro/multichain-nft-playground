# Writes public/samples/{1..6}.png (gradients) and .json pointing at BASE/N.png.
# usage: python3 scripts/gen-samples.py [https://public.host/samples]
import json, struct, sys, zlib, os

base = (sys.argv[1] if len(sys.argv) > 1 else 'https://raw.githubusercontent.com/mikekoro/multichain-nft-playground/main/public/samples').rstrip('/')
out = os.path.join(os.path.dirname(__file__), '..', 'public', 'samples')
os.makedirs(out, exist_ok=True)
W = 256
colors = [((255, 80, 80), (40, 0, 90)), ((80, 200, 255), (0, 40, 90)), ((120, 255, 120), (0, 60, 30)),
          ((255, 200, 60), (90, 40, 0)), ((220, 120, 255), (50, 0, 80)), ((255, 255, 255), (20, 20, 20))]
names = ['Ruby', 'Sky', 'Mint', 'Amber', 'Orchid', 'Mono']

def chunk(tag, data):
    c = tag + data
    return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

def png(a, b):
    rows = b''
    for y in range(W):
        row = bytearray([0])
        for x in range(W):
            t = (x + y) / (2 * W - 2)
            row += bytes(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        rows += bytes(row)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', W, W, 8, 2, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(rows, 9)) + chunk(b'IEND', b''))

for i, ((a, b), name) in enumerate(zip(colors, names), 1):
    with open(f'{out}/{i}.png', 'wb') as f: f.write(png(a, b))
    with open(f'{out}/{i}.json', 'w') as f:
        json.dump({'name': f'Playground Sample {name}', 'description': f'Playground sample #{i}', 'image': f'{base}/{i}.png'}, f, indent=2)
print(f'wrote 6 samples, image base {base}')
