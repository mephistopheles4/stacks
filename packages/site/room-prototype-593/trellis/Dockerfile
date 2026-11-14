# PROTOTYPE for #593 — TRELLIS.2 (MIT, microsoft/TRELLIS.2) on an RTX 5090 (Blackwell, sm_120).
# Build:  docker build -t stacks-trellis2 packages/site/room-prototype-593/trellis
# Run:    docker run --rm --gpus all -e HF_TOKEN -v stacks-trellis-cache:/cache -v <dir>:/work stacks-trellis2 /work/<photo> /work/<out.glb> 60000
#         HF_TOKEN comes from the caller's environment at run time and is never written into the image.
FROM pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel

ENV DEBIAN_FRONTEND=noninteractive \
    TORCH_CUDA_ARCH_LIST="12.0" \
    ATTN_BACKEND=xformers \
    SPARSE_ATTN_BACKEND=xformers \
    PYTORCH_CUDA_ALLOC_CONF=expandable_segments:True \
    MAX_JOBS=4 \
    HF_HOME=/cache/hf

RUN apt-get update && apt-get install -y --no-install-recommends git libjpeg-dev libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir xformers==0.0.30 --index-url https://download.pytorch.org/whl/cu128 \
 && pip install --no-cache-dir imageio imageio-ffmpeg tqdm easydict opencv-python-headless ninja trimesh \
        transformers huggingface_hub safetensors pandas zstandard kornia timm pillow \
 && pip install --no-cache-dir git+https://github.com/EasternJournalist/utils3d.git@9a4eb15e4021b67b12c460c7057d642626897ec8

# Pinned to the commit read before writing this file.
RUN git clone --recursive https://github.com/microsoft/TRELLIS.2.git /opt/trellis2 \
 && cd /opt/trellis2 && git checkout 75fbf01 && git submodule update --init --recursive

WORKDIR /tmp/ext
RUN git clone -b v0.4.0 https://github.com/NVlabs/nvdiffrast.git && pip install ./nvdiffrast --no-build-isolation
RUN git clone -b renderutils https://github.com/JeffreyXiang/nvdiffrec.git && pip install ./nvdiffrec --no-build-isolation
RUN git clone --recursive https://github.com/JeffreyXiang/CuMesh.git && pip install ./CuMesh --no-build-isolation
RUN git clone --recursive https://github.com/JeffreyXiang/FlexGEMM.git && pip install ./FlexGEMM --no-build-isolation
RUN cp -r /opt/trellis2/o-voxel ./o-voxel && pip install ./o-voxel --no-build-isolation

WORKDIR /opt/trellis2
# BiRefNet's remote modelling code imports einops; added last so the extension layers stay cached.
RUN pip install --no-cache-dir einops
COPY generate.py /opt/generate.py
ENTRYPOINT ["python", "/opt/generate.py"]
