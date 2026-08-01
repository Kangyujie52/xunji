"""简化 GLB 网格：quadric decimation 降低面数，大幅减小文件体积。
用法: python _simplify_glb.py <input.glb> <output.glb> [target_faces=50000]"""
import sys, os, struct, json, base64
import trimesh
import numpy as np

inp = sys.argv[1]
out = sys.argv[2]
target = int(sys.argv[3]) if len(sys.argv) > 3 else 50000

print(f"加载 {inp} ...")
scene = trimesh.load(inp, force='mesh', skip_materials=False, process=False)
if isinstance(scene, trimesh.Scene):
    # 合并为单一 mesh
    mesh = scene.dump(concatenate=True)
else:
    mesh = scene

orig_faces = len(mesh.faces)
orig_verts = len(mesh.vertices)
print(f"原始: {orig_verts} 顶点, {orig_faces} 面, 文件 {os.path.getsize(inp)/1024/1024:.1f}MB")

if orig_faces <= target:
    print("面数已低于目标，直接复制")
    import shutil; shutil.copy(inp, out)
    sys.exit(0)

# quadric decimation 简化
print(f"简化到约 {target} 面 ...")
simple = mesh.simplify_quadric_decimation(face_count=target)
simp_faces = len(simple.faces)
simp_verts = len(simple.vertices)
print(f"简化后: {simp_verts} 顶点, {simp_faces} 面 (压缩比 {simp_faces/orig_faces:.1%})")

# 导出 GLB
simple.export(out)
out_size = os.path.getsize(out) / 1024 / 1024
print(f"导出: {out} ({out_size:.1f}MB)")
