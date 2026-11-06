# URL Shortener - Rút Gọn Link

Ứng dụng rút gọn link bằng Node.js + Express, lưu dữ liệu bằng SQLite.
Không cần cài thêm database server.

## Tính năng

- Rút gọn link dài, hoặc tự đặt mã ngắn, ví dụ `/khuyen-mai`.
- Đặt thời hạn cho link: 1 ngày, 7 ngày, 30 ngày, 1 năm.
- Đếm lượt click và xem biểu đồ click theo ngày trong 30 ngày gần nhất.
- Tạo mã QR cho mỗi link, xem và tải về dạng SVG.
- Xóa link.
- Mỗi trình duyệt chỉ thấy và quản lý link của chính mình.
- Chỉ nhận link `http://` / `https://`, giới hạn số link tạo mỗi phút theo IP.
- Giao diện tiếng Việt và tiếng Anh.

## Hiệu năng

Đo trên máy dev (Windows, Node 22, một tiến trình) bằng `npm run bench`:

| Kịch bản | Tốc độ | Lỗi | Độ trễ p50 / p99 |
|---|---|---|---|
| Chuyển hướng `GET /:code` | 3000 req/s trong 30 giây | 0 | 6 ms / 44 ms |
| Tạo link `POST /api/shorten` | ~3000 req/s trong 10 giây | 0 | 15 ms / 112 ms |

RAM cao nhất trong bài test: **~82 MB** (mục tiêu dưới 200 MB).

Vì sao nhanh mà ít RAM:

- SQLite chạy ở chế độ WAL, ngay trong tiến trình Node. Đọc một link mất khoảng 2 µs, không cần kết nối mạng như Redis / MongoDB.
- Dữ liệu nằm trên đĩa, không nằm trong RAM, nên RAM không tăng theo số lượng link. Bộ nhớ đệm trang của SQLite giới hạn 16 MB.
- Lượt click được gom lại và ghi một lần mỗi giây, thay vì ghi đĩa cho từng click.
- Các yêu cầu tạo link đến cùng lúc được ghi trong một transaction.
- `npm start` giới hạn heap của Node ở 128 MB.

## Cài đặt

Yêu cầu: Node.js 20 trở lên.

```bash
npm install
copy .env.example .env     # sau đó sửa BASE_URL thành tên miền của bạn
npm start                  # production
npm run dev                # development, tự khởi động lại khi sửa code
```

Mở trình duyệt: `http://localhost:3000`

### Biến môi trường (`.env`)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | `3000` | Cổng chạy server |
| `BASE_URL` | `http://localhost:PORT` | Địa chỉ public, dùng để tạo link ngắn |
| `DB_PATH` | `data/urls.db` | File database SQLite (tự tạo) |
| `RATE_LIMIT_PER_MIN` | `30` | Số link tối đa một IP tạo mỗi phút |
| `TRUST_PROXY` | (trống) | Đặt `1` nếu chạy sau nginx / Cloudflare để lấy đúng IP |

## Kiểm thử

```bash
npm test
```

Đo tải (chạy server trước, nâng giới hạn tạo link để đo phần tạo link):

```bash
set RATE_LIMIT_PER_MIN=100000000 && npm start
npm run bench -- --rate 3000 --duration 30
```

## Cấu trúc thư mục

```
shorturl/
├── config/
│   ├── index.js       # Đọc biến môi trường
│   └── db.js          # Mở SQLite, cấu hình hiệu năng, tạo bảng
├── models/
│   └── Url.js         # Truy vấn dữ liệu, gom click và gom lô tạo link
├── routes/
│   └── url.js         # API và route chuyển hướng
├── public/            # Giao diện (index.html, styles.css, script.js)
├── scripts/bench.js   # Đo tải bằng autocannon
├── test/api.test.js   # Kiểm thử API
└── server.js          # Khởi động server
```

## API

| Method | Đường dẫn | Mô tả |
|---|---|---|
| `POST` | `/api/shorten` | Body `{ "originalUrl": "...", "customCode"?: "...", "expiresInDays"?: 7 }`. Trả `201` khi tạo mới, `200` khi link này đã rút gọn trước đó, `409` khi mã tùy chỉnh đã có người dùng. |
| `GET` | `/api/urls?limit=20&offset=0` | Danh sách link của bạn: `{ items, hasMore }` |
| `GET` | `/api/urls/:code/stats` | Thông tin link và số click từng ngày trong 30 ngày |
| `GET` | `/api/urls/:code/qr` | Mã QR (SVG) |
| `DELETE` | `/api/urls/:code` | Xóa link |
| `GET` | `/:code` | Chuyển hướng tới link gốc (`404` nếu không có, `410` nếu đã hết hạn) |

Mỗi link có dạng: `{ urlCode, shortUrl, originalUrl, clicks, createdAt, expiresAt }`.

## Ghi chú

- Không có tài khoản: trình duyệt được cấp một cookie ẩn danh. Xóa cookie hoặc dùng trình duyệt khác thì sẽ không thấy lại lịch sử (link vẫn hoạt động).
- Khi tắt server bằng Ctrl+C, các lượt click chưa ghi sẽ được lưu trước khi thoát. Nếu server bị tắt đột ngột, có thể mất tối đa 1 giây lượt click.
- Sao lưu: copy file trong thư mục `data/`.
