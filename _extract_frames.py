import cv2, os
video = r"D:/安装/xwechat_files/wxid_sg52yvnmsh1m21_7e19/temp/RWTemp/2026-07/9e20f478899dc29eb19741386f9343c8/e8ca125dc7536117fb37e63a5f0153d4.mp4"
out = r"F:/2026-07-29-13-36-47/workstation/_frames"
os.makedirs(out, exist_ok=True)
cap = cv2.VideoCapture(video)
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
fps = cap.get(cv2.CAP_PROP_FPS)
print("total_frames", total, "fps", fps, "duration_s", round(total/fps, 2) if fps else 0)
n = 12
step = max(1, total // n) if total > n else 1
idx = 0
count = 0
while True:
    ret, frame = cap.read()
    if not ret:
        break
    if idx % step == 0:
        p = os.path.join(out, f"frame_{count:02d}_{idx:05d}.jpg")
        cv2.imwrite(p, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
        count += 1
    idx += 1
    if total <= n:
        # already every frame
        if idx >= total:
            break
cap.release()
print("saved", count, "frames to", out)
