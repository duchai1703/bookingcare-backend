# Tài liệu Thiết kế Kiến trúc (Architecture Design Document)
**Chuyên đề:** Triển khai Hệ thống Tìm kiếm Nâng cao (Advanced Search Engine) sử dụng NoSQL (Elasticsearch)
**Dự án:** Hệ thống Đặt lịch Khám bệnh Trực tuyến (BookingCare Clone)

---

## 1. Giới thiệu và Phân tích Hiện trạng (Context & Problem Statement)

### 1.1 Hiện trạng của hệ thống
Thanh tìm kiếm (Global Search Bar) tại `Banner.jsx` đang gọi API từ Backend. Tại Backend, truy vấn tìm kiếm được xử lý bằng cơ sở dữ liệu quan hệ **MySQL** thông qua ORM Sequelize bằng cú pháp tương tự như:
```sql
SELECT * FROM Users JOIN Doctor_Infos ON Users.id = Doctor_Infos.doctorId 
WHERE Users.firstName LIKE '%keyword%' OR Users.lastName LIKE '%keyword%';
```

### 1.2 Các nút thắt cổ chai (Bottlenecks)
1. **Hiệu năng truy vấn (Performance):** Việc sử dụng Wildcard (`%keyword%`) ở đầu chuỗi văn bản khiến hệ quản trị CSDL MySQL **từ chối sử dụng B-Tree Index**. Kết quả là MySQL phải thực hiện **Full-Table Scan** (Quét toàn bộ bảng dữ liệu) với độ phức tạp thời gian là $O(N)$. Nếu hệ thống có $100,000$ bác sĩ, nó sẽ quét qua $100,000$ dòng cho mỗi lần gõ phím của người dùng.
2. **Xử lý Ngôn ngữ Tự nhiên (Natural Language Processing - NLP):**
   - Không hỗ trợ tìm kiếm không dấu (Người dùng gõ `xuong khop`, MySQL chỉ tìm đúng chuỗi `xuong khop` chứ không hiểu đó là `xương khớp`).
   - Không hỗ trợ sai số (Typo Tolerance). Gõ `bác sỹ` thay vì `bác sĩ` sẽ trả về mảng rỗng.
3. **Kiểm soát Tải (Load Management):** Trộn lẫn luồng **Read** (Tìm kiếm - diễn ra liên tục) và luồng **Write** (Đặt lịch khám - cần đảm bảo ACID chặt chẽ) trên cùng một Database sẽ gây nghẽn kết nối (Connection Pool Exhaustion) trong giờ cao điểm.

---

## 2. Đề xuất Giải pháp Kiến trúc (Proposed Architecture CQRS)

Sử dụng mô hình **CQRS** (Command Query Responsibility Segregation) để phân tách cơ sở dữ liệu.
- **MySQL (Primary/Command DB):** Chuyên chịu trách nhiệm Lưu trữ, Cập nhật, Xóa và Đảm bảo tính toàn vẹn (ACID) của giao dịch đặt lịch.
- **Elasticsearch (Read/Query DB):** Cơ sở dữ liệu NoSQL chuyên dụng dựa trên cấu trúc Inverted Index (Chỉ mục ngược). Nó đóng vai trò làm *Read-replica* chỉ chuyên phục vụ truy vấn Tìm kiếm siêu tốc ($O(1)$).

```mermaid
graph TD
    Client[Frontend: Banner.jsx Search Bar] -->|API: GET /api/search?q=...| BE(Backend API Node.js)
    ClientAdmin[Frontend Admin] -->|API: POST /api/create-doctor| BE
    BE -->|1. Write Data (Command)| SQL[(MySQL - Primary DB)]
    BE -->|2. Sync Data (Async)| ES[(Elasticsearch - Search DB)]
    BE -->|3. Read Data (Query)| ES
    SQL -.->|Batch Migration Script| ES
    
    style SQL fill:#f9f,stroke:#333,stroke-width:2px
    style ES fill:#9ff,stroke:#333,stroke-width:2px
```

---

## 3. Bản đồ Chuyển đổi Dữ liệu (Data Mapping Strategy)

Trong SQL, dữ liệu một bác sĩ bị phân mảnh ở nhiều bảng (`Users`, `Doctor_Infos`, `Markdowns`, `Specialties`, `Clinics`). 
Trong NoSQL (Elasticsearch), chúng ta sẽ gom (Flatten) hoặc chuẩn hóa ngược (Denormalize) toàn bộ thông tin này thành một file JSON Document nguyên khối nằm gọn trong 1 Index được thiết kế tên là `bookingcare_search`.

**Ví dụ một Document lưu trong Elasticsearch:**
```json
{
  "id": "doctor_15",
  "type": "DOCTOR",
  "doctorId": 15,
  "fullName": "Nguyễn Văn A",
  "fullName_no_accents": "nguyen van a",
  "specialtyId": 2,
  "specialtyName": "Cơ xương khớp",
  "clinicId": 5,
  "clinicName": "Bệnh viện Chợ Rẫy",
  "description": "Bác sĩ trưởng khoa chấn thương chỉnh hình..."
}
```
*Việc gộp chung này giúp truy vấn của Elasticsearch không cần đụng đến lệnh JOIN đắt đỏ, chỉ cần bốc Data ra rồi trả về ngay lập tức.*

---

## 4. Phân tích Tác động Chi tiết (Detailed Impact Analysis)

### 4.1. Tầng Hạ tầng (Infrastructure)
Bạn cần thêm file `docker-compose.yml` tại root của C:\Users\USER\Documents\DOAN1\bookingcare-backend\ để khởi chạy môi trường giả lập NoSQL.
*Cần cấu hình phiên bản Elastic 8.x.*

### 4.2. Tầng Code Backend (`bookingcare-backend`)

#### A. Thêm Module Cốt lõi
- Tạo thư mục `src/services/elasticSearchService.js`: File này sẽ đóng gói (Encapsulate) toàn bộ logic tương tác với NoSQL.
- Chức năng của file này:
  1. `connectElastic()`: Khởi tạo kết nối.
  2. `createIndexIfNotExist()`: Tạo bảng (Index) và cài đặt tokenizer/analyzer tiếng Việt tĩnh.
  3. `indexData(document)`: Hàm thêm/sửa một Document JSON.
  4. `deleteData(id)`: Hàm xóa.
  5. `searchFuzzy(keyword)`: Hàm query tìm kiếm thuật toán mờ.

#### B. Sửa luồng tìm kiếm (Search Flow)
Tại tệp tin `src/services/userService.js`, hàm `handleGlobalSearch(keyword)` hiện tại gọi lệnh `db.Doctor.findAll()` DB SQL sẽ được chỉnh sửa cấu trúc:
```javascript
// Thay vì:
// let data = await db.Doctor.findAll({ where: { name: {[Op.like]: `%${keyword}%`} } })

// Trở thành:
const esService = require('./elasticSearchService');
let searchResults = await esService.searchFuzzy(keyword);
// searchResults đã chứa sẵn cả 3 mảng: Bác sĩ, Phòng khám, Chuyên khoa.
return searchResults;
```

#### C. Sửa luồng Đồng bộ Thông tin (Data Sync Flow) - Sự kiện Write
**Vị trí sửa:** `src/controllers/adminController.js`, `specialtyController.js`, `clinicController.js`.
Mọi hàm Tạo (Create), Cập nhật (Update), Xóa (Delete) **bắt buộc** phải có đoạn Code "móc nối" (Hook Async) gọi sang `elasticSearchService`.

*Ví dụ ở chức năng Lưu thông tin Bác sĩ (Save Doctor Info):*
```javascript
let saveDoctorInfo = async (data) => {
    // 1. Lưu vào MySQL (Giữ nguyên logic cũ của bạn)
    await db.Markdown.upsert({ ... });
    await db.Doctor_Info.upsert({ ... });
    
    // 2. NGAY LẬP TỨC: Query tổng hợp (JOIN) để lấy ra 1 Object hoàn chỉnh
    let fullDoctorObject = await getFullDoctorDetails(data.doctorId); 
    
    // 3. ĐỒNG BỘ: Chuyển dữ liệu sang Elasticsearch
    await elasticSearchService.indexData({
        id: `doctor_${data.doctorId}`,
        type: 'DOCTOR',
        ...fullDoctorObject
    });
}
```

### 4.3. Tầng Code Frontend (`bookingcare-frontend`)
Thay đổi tại Client là RẤT ÍT, gần như "Trong suốt" (Transparent) với người dùng:
- File `src/containers/HomePage/Sections/Banner.jsx`: Giữ nguyên hầu hết cấu trúc.
- Do dữ liệu Backend trả về từ NoSQL được định dạng sẵn cấu trúc cũ JSON *(VD: `{ errCode: 0, data: { doctors: [], specialties: [], clinics: [] } }`)*, giao diện UI của chức năng Render Map (vòng lặp đổ kết quả ra màn hình) không cần chạm vào lõi.

---

## 5. Kế hoạch Triển khai (Step-by-step Execution Plan)

Để hoàn tất đồ án này mà không làm hỏng code hiện tại, ta đi qua 4 Phase tách biệt:

- **Phase 1: Setup Dịch vụ & Kết nối (1 Ngày)**
  - Cài đặt Elasticsearch Nodejs Client: `npm install @elastic/elasticsearch`.
  - Khởi tạo Instance Elastic local qua Docker.
  - Viết file test ping kết nối `elasticSearchService.js`.

- **Phase 2: Viết thuật toán Tìm kiếm mờ (Fuzzy Search Logic) (2 Ngày)**
  - Xây dựng câu lệnh Query JSON gửi cho Elastic. Dùng kỹ thuật truy vấn `multi_match` trên nhiều cột (ví dụ: `fullName`, `specialtyName`) gắn kèm `"fuzziness": "AUTO"` để chịu lỗi chính tả độ lệch 2 ký tự.

- **Phase 3: Scripts Di trú Cơ sở dữ liệu (Migration Script) (1 Ngày)**
  - Do DB MySQL của bạn hiện tại đã chứa sẵn hàng nghìn dòng dữ liệu cũ, Elastic đang trắng trơn.
  - Cần viết một script `tools/migrateSQLtoES.js` chạy thủ công 1 lần duy nhất bằng Terminal: Lấy toàn bộ SQL -> Ép kiểu JSON -> Bắn `bulk API` sang Elastic.

- **Phase 4: Gắn Hook Cập nhật Tức thời (Real-time Syncing Hooks) (2 Ngày)**
  - Như phân tích tác động ở Mục 4.2.C. Rà soát toàn bộ các RESTful API có method POST/PUT/DELETE liên quan đến 3 thực thể (Doctor, Clinic, Specialty) và chèn logic đồng bộ.

---

## 6. Đánh giá Ưu nhược điểm (Trade-offs / Evaluation) cho Luận văn

### Điểm mạnh tuyệt đối (Pros) - Điều cần làm nổi bật trong Luận văn
- Trải nghiệm như trang web triệu đô: Tốc độ phản hồi cực nhanh dưới 50ms (Giảm tình trạng Spinner quay lâu ở Frontend).
- Tiếng Việt được xử lý mượt mà, thân thiện với người không gõ được dấu.
- Giải cứu MySQL: Giải phóng 100% tải tài nguyên của Database chính vào mục đích quản lý Transaction nghiêm ngặt.

### Điểm yếu/Thách thức (Mặt trái cần nắm rõ - Cons)
- **Cấu hình phức tạp hơn:** Team dev phải duy trì song song 2 Database thay vì 1.
- **Tính nhất quán Cuối cùng (Eventual Consistency):** Khi lưu MySQL vừa xong, người dùng có thể mất khoảng 0.5s - 1s thì dữ liệu bên Elastic mới được index xong, dẫn đến việc nếu thao tác tạo xong gõ tìm kiếm luôn thì có nguy cơ bị "trễ nhịp" mất một thoáng (Rất hiếm gặp thực tế ở Frontend vì độ delay của người dùng gõ dài hơn thời gian đồng bộ của Code).

---
**Tài liệu này đóng vai trò Bản thiết kế Cấp cao (High-Level Design). Việc thực thi đòi hỏi cấu hình môi trường chính xác. Nếu đồng ý với thiết kế này, chúng ta sẽ bắt tay chuyển qua giai đoạn "Implementation" (Triển khai code thực tế) nhé.**
