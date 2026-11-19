# Worker Xưởng 3D

Mỗi máy chạy một tiến trình `worker.py`. Nó hỏi hàng đợi (Edge Function `gen3d-studio`) xem có job loại máy làm được không,
tải ảnh và mesh đầu vào, chạy pipeline của loại đó, tải kết quả lên Storage rồi báo xong. Hợp đồng API và dữ liệu:
`docs/gen3d-studio.md`.

## Cài đặt

- Python 3.8 trở lên và `requests` (`pip install requests`). Không cần gói nào khác cho chính worker.
- Khoá worker ở `~/.gen3d-worker-key` (một dòng, đúng secret `GEN3D_WORKER_KEY` của function), hoặc biến môi trường `GEN3D_WORKER_KEY`.
- GPU NVIDIA: worker đọc VRAM bằng `nvidia-smi`.

## Chạy

```
python tools/gen3d-worker/worker.py --id pc:gen3d --label "PC · RTX 3050" --priority 0 --caps shape,texture,rig --work-dir D:\gen3d-worker
python3 tools/gen3d-worker/worker.py --id linux2:gen3d --priority 1 --delay 30 --caps shape,rig --work-dir ~/gen3d-worker
```

Thử cả vòng hôm nay, chưa có TripoSG: thêm `--fake`. Pipeline giả ra khối cầu (Triangle) hoặc khối hộp (Quad) cho shape, cầu có
atlas ca-rô cho texture, và `Xbot.glb` mẫu của three.js (xương Mixamo) cho rig, nên trang Thử anim chạy được ngay.

| Tham số | Biến môi trường | Mặc định | Ý nghĩa |
|---|---|---|---|
| `--id` | `GEN3D_WORKER_ID` | `<hostname>:gen3d` | dạng `máy:tên` |
| `--label` | `GEN3D_LABEL` | id | tên hiện trên tab Máy gen |
| `--priority`, `--delay` | `GEN3D_PRIORITY`, `GEN3D_DELAY` | 0, 0 | giá trị đầu; admin sửa trên trang thì trang thắng |
| `--caps` | `GEN3D_CAPS` | `shape,texture,rig` | loại job máy này nhận |
| `--work-dir` | `GEN3D_WORK_DIR` | `~/gen3d-worker` | thư mục job, cache, log `worker-<id>.log` |
| `--pipelines` | | `pipelines.json` cạnh worker | lệnh của từng kind |
| `--fake` | | tắt | dùng `fake_pipeline.py` cho mọi kind |
| `--min-commit-gb` | | 8 | Windows: commit trống tối thiểu trước khi nhận job |
| `--min-ram-gb` | | 6 | Linux: `MemAvailable` tối thiểu |
| `--min-vram-gb` | | 4 | VRAM trống tối thiểu; 0 = bỏ kiểm GPU |
| `--poll` | | 4 | giây giữa hai lần hỏi hàng đợi |
| `--once` | | | thoát sau một job |
| `--max-idle` | | 0 | thoát sau N giây không nhận job (0 = chạy mãi) |

Tắt: Ctrl+C. Đang chạy job thì worker dừng pipeline, trả job về hàng đợi (không tính lượt) rồi thoát. Gỡ hẳn máy khỏi trang:
action `bye`.

## Cổng tài nguyên

Trước **mỗi** lần claim, worker đo: Windows commit trống (`GlobalMemoryStatusEx.ullAvailPageFile`) ≥ 8 GB, Linux
`MemAvailable` ≥ 6 GB, VRAM trống ≥ 4 GB. Thiếu thì báo trạng thái `lowmem` kèm lý do, không claim; job rơi sang máy sau
(máy khác không nhường cho máy đang `lowmem`). Máy chung với nhiều phiên Claude, nên đây là luật cứng, không là quy ước.
Pipeline tự thấy thiếu bộ nhớ giữa chừng thì thoát mã 75: worker trả job về hàng đợi, không tính lượt.

## Pipeline: `pipelines.json`

```json
{ "shape": { "argv": ["{python}", "{here}/fake_pipeline.py", "{job_json}", "{out_dir}"], "timeout_s": 1800, "cwd": "{job_dir}" } }
```

Khoá là kind, `argv` là lệnh với chỗ điền: `{python}` `{here}` `{job_json}` `{job_dir}` `{in_dir}` `{out_dir}` `{parent_glb}`
`{view_front}` `{view_back}` `{view_left}` `{view_right}` `{work_dir}` `{kind}`. `timeout_s` quá thì worker giết cả cây tiến trình
và báo hỏng.

Worker chuẩn bị trước khi chạy:

- `job.json`: `{ id, kind, params, root_params, inputs: { views: { front: <đường dẫn file>, ... }, parent_glb }, work_dir, out_dir }`.
  `params` là của chính job; ảnh luôn lấy từ job shape gốc (`root_params.views`).
- `in/views/<góc>.<ext>` ảnh người dùng gửi; `in/parent.glb` mesh của job cha (texture, rig).

Pipeline trả lời:

- stdout `@@STAGE <stage> <lời nhắn>`: tiến độ. Stage theo kind: shape `segment · generate · optimize`; texture `delight ·
  project · inpaint · bake`; rig `skeleton · skin` (worker tự báo `setup` và `uploading`).
- stdout `@@PREVIEW <file trong out_dir>`: ảnh xem trước, worker tải lên và gắn vào job.
- `out_dir/result.json`: `{ "files": { "glb": "model.glb", "thumb": "thumb.png", ... }, "stats": { "tris", "verts", ... } }`, đường
  dẫn tương đối trong `out_dir`. `files.views_clean` là object `{ front: "views_clean/front.png", ... }`. Bắt buộc có `glb`.
- Mã thoát 0 = xong, 75 = trả job (thiếu bộ nhớ), khác = hỏng (40 dòng stdout cuối vào lỗi).

Lắp TripoSG thật = đổi dòng `shape` sang script chạy TripoSG trong venv của nó, ví dụ
`["D:/gen3d/venv/Scripts/python.exe", "D:/gen3d/run_shape.py", "{job_json}", "{out_dir}"]`, script đó theo đúng giao thức trên.

## Thư viện anim Mixamo

Cần `npm install` trong thư mục này (three 0.160.0, chỉ cho hai script dưới).

- `node tools/gen3d-worker/import-mixamo.mjs --fbx D:\gen3d-mixamo\fbx --meta D:\gen3d-mixamo\motions.json`: đổi từng FBX Mixamo
  ("Without Skin") sang clip glb (xương + một animation, quaternion lưu int16 chuẩn hoá, Hips position float) bằng FBXLoader của
  three.js chạy trong Node, tải lên `gen3d/mixamo/`, ghi `index.json`. Chạy lại chỉ làm file mới: trạng thái ở `<out>/state.json`
  (mặc định `<fbx>/../glb`). File FBX sửa đổi trong 5 giây gần nhất (còn đang tải về) để lần sau.
- `node tools/gen3d-worker/seed-mixamo.mjs`: dự phòng, tách clip của `Xbot.glb` + `Soldier.glb` (mẫu three.js) thành
  `seed-*.glb` + `seed-index.json`. Trang Thử anim gộp cả hai danh sách.
