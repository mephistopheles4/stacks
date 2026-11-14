"""PROTOTYPE for #593 — one image in, one GLB out, inside the stacks-trellis2 container.

usage (in the container): python /opt/generate.py /work/in.jpg /work/out.glb [decimation_target]

The background remover is swapped from briaai/RMBG-2.0 (non-commercial, gated) to
ZhengPeng7/BiRefNet (MIT). DINOv3 is gated: HF_TOKEN must be in the environment the
first time, after which the weights sit in the mounted /cache and the token is unused.
"""
import os
import sys

os.chdir("/opt/trellis2")
sys.path.insert(0, "/opt/trellis2")

from PIL import Image  # noqa: E402
from trellis2.pipelines import rembg  # noqa: E402

_BiRefNet = rembg.BiRefNet


def _mit_birefnet(**kwargs):
    kwargs["model_name"] = "ZhengPeng7/BiRefNet"
    return _BiRefNet(**kwargs)


rembg.BiRefNet = _mit_birefnet

import o_voxel  # noqa: E402
from trellis2.pipelines import Trellis2ImageTo3DPipeline  # noqa: E402

src, dst = sys.argv[1], sys.argv[2]
target = int(sys.argv[3]) if len(sys.argv) > 3 else 60000

pipeline = Trellis2ImageTo3DPipeline.from_pretrained("microsoft/TRELLIS.2-4B")
pipeline.cuda()
mesh = pipeline.run(Image.open(src))[0]
mesh.simplify(16777216)
glb = o_voxel.postprocess.to_glb(
    vertices=mesh.vertices, faces=mesh.faces, attr_volume=mesh.attrs, coords=mesh.coords,
    attr_layout=mesh.layout, voxel_size=mesh.voxel_size, aabb=[[-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]],
    decimation_target=target, texture_size=2048, remesh=True, remesh_band=1, remesh_project=0, verbose=True,
)
glb.export(dst, extension_webp=False)
print(f"[trellis] wrote {dst}")
