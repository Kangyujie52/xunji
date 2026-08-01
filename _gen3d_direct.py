import sys, os, json, importlib.util, urllib.request

BC_DIR = r"C:/Users/81471/AppData/Local/Programs/WorkBuddy/resources/app.asar.unpacked/resources/builtin-skills/buddy-multimodal-generation/scripts/buddy-cloud.py"
spec = importlib.util.spec_from_file_location("buddy_cloud", BC_DIR)
bc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bc)

endpoint = bc._DEFAULT_ENDPOINT
cfg = bc._PROVIDER_MAP["3d"]

mode = sys.argv[1]

if mode == "submit":
    b64_file = sys.argv[2]
    token = sys.argv[3]
    prompt = ""
    for i, a in enumerate(sys.argv):
        if a == "--prompt" and i + 1 < len(sys.argv):
            prompt = sys.argv[i + 1]
    b64 = open(b64_file).read().strip() if b64_file.lower() != "none" else None
    body = bc._build_3d_body(prompt=prompt, image_base64=b64, model="3.1", enable_pbr=True, face_count=500000)
    submit_resp = bc._call_api(endpoint, cfg["provider"], cfg["service"], cfg["version"], cfg["submit_action"], body, token)
    job_id = submit_resp.get("JobId")
    print(json.dumps({"job_id": job_id, "status": "SUBMITTED" if job_id else "FAIL", "raw": submit_resp}))

elif mode == "poll":
    job_id = sys.argv[2]
    token = sys.argv[3]
    outpath = sys.argv[4] if len(sys.argv) > 4 else None
    result = bc._poll_job(endpoint, cfg["provider"], cfg["service"], cfg["version"], cfg["query_action"], job_id, token, 5, 600)
    print("=== RESULT ===")
    print(json.dumps(result, ensure_ascii=False))
    if outpath:
        files_3d = result.get("ResultFile3Ds", [])
        glb_url = None
        for f in files_3d:
            s = json.dumps(f, ensure_ascii=False).lower()
            if "glb" in s:
                glb_url = f.get("FileUrl") or f.get("Url") or f.get("url")
                break
        if glb_url:
            urllib.request.urlretrieve(glb_url, outpath)
            print("=== DOWNLOADED", outpath, os.path.getsize(outpath), "bytes ===")
        else:
            print("=== NO_GLB_FOUND ===")
else:
    print("unknown mode")
