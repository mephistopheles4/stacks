"""PROTOTYPE for #593: cut the chair out of the photo with BiRefNet (MIT), keeping BRIA's
non-commercial RMBG-2.0 out of the pipeline. TRELLIS.2 skips its own background remover for
an image that already has an alpha channel.

usage (in the stacks-trellis2 container): python /scripts/mask.py /work/in.jpg /work/out.png
No token: ZhengPeng7/BiRefNet is not gated.
"""
import sys

sys.path.insert(0, "/opt/trellis2")

from PIL import Image  # noqa: E402
from trellis2.pipelines.rembg.BiRefNet import BiRefNet  # noqa: E402

src, dst = sys.argv[1], sys.argv[2]
net = BiRefNet("ZhengPeng7/BiRefNet")
net.cuda()
net.model.float()  # the checkpoint loads in half precision; the wrapper feeds float32
out = net(Image.open(src).convert("RGB"))
bbox = out.getchannel("A").point(lambda a: 255 if a > 128 else 0).getbbox()
out.crop(bbox).save(dst)
print(f"[mask] wrote {dst} {out.size} cropped to {bbox}")
