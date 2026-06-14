# Kế hoạch triển khai (V2) - Tối ưu hóa toàn diện AI Chatbot BookingCare

Kế hoạch này tích hợp đầy đủ 5 ý kiến đóng góp xuất sắc của bạn và đã được **rà soát cực kỳ khắt khe** để chặn đứng mọi kịch bản lỗi (Edge Cases) tiềm ẩn.

---

## 1. Báo cáo rà soát nghiêm ngặt (Auditing & Loophole Report)

Dưới vai trò là một kỹ sư hệ thống khó tính, mình đã rà soát lại toàn bộ bản thảo Prompt và phát hiện ra **4 kẽ hở kỹ thuật nhỏ** có thể khiến AI phản hồi sai lệch trong thực tế. Mình đã vá các kẽ hở này như sau:

*   **Kẽ hở 1: Mâu thuẫn khi không gọi hàm (Nhóm 1)**
    *   *Rủi ro:* Câu lệnh cũ yêu cầu *"Chỉ trích xuất ĐÚNG dữ liệu từ kết quả Function"*. Nếu người dùng chỉ chào xã giao (không gọi hàm), AI có thể bị bối rối vì không có dữ liệu hàm để trích xuất.
    *   *Khắc phục:* Bổ sung ngoại lệ: *"Đối với câu hỏi xã giao không cần gọi hàm, trả lời tự nhiên, lịch sự và ngắn gọn."*
*   **Kẽ hở 2: Đề cập nhiều triệu chứng thuộc nhiều chuyên khoa khác nhau (Nhóm 2)**
    *   *Rủi ro:* Người dùng chat: *"Tôi vừa đau bụng vừa đau khớp"*. Bản đồ triệu chứng cũ chỉ quy định ánh xạ 1-1, AI có thể bỏ qua một trong hai triệu chứng.
    *   *Khắc phục:* Bổ sung luật xử lý đa chuyên khoa: *"Nếu người dùng đề cập nhiều triệu chứng thuộc các chuyên khoa khác nhau, AI được phép gọi lần lượt các function cho từng chuyên khoa hoặc hỏi người dùng muốn ưu tiên khám chuyên khoa nào trước."*
*   **Kẽ hở 3: Bác sĩ/Phòng khám hoàn toàn không tồn tại trên hệ thống (Nhóm 2)**
    *   *Rủi ro:* DB trả về rỗng. AI có thể báo "Hệ thống chưa cập nhật" (khiến người dùng tưởng bác sĩ có tồn tại nhưng chưa có thông tin) thay vì thông báo "Không có bác sĩ này trên hệ thống".
    *   *Khắc phục:* Bổ sung phân biệt rõ ràng: *"Nếu tra cứu bác sĩ/phòng khám cụ thể mà không có kết quả trả về, thông báo lịch sự rằng bác sĩ/phòng khám này chưa có trên hệ thống BookingCare và gợi ý người dùng tìm kiếm theo chuyên khoa."*
*   **Kẽ hở 4: Người dùng sử dụng đại từ thay thế không rõ ràng (Nhóm 3)**
    *   *Rủi ro:* Người dùng chat: *"Còn người kia thì sao?"* khi trong lịch sử 6 tin nhắn gần nhất có nhắc đến cả bác sĩ Nghĩa và bác sĩ Hùng. AI dễ tự đoán mò.
    *   *Khắc phục:* Bổ sung luật làm rõ đối tượng: *"Nếu người dùng dùng đại từ thay thế không rõ ràng (VD: 'người kia', 'bác sĩ đó') khi trong lịch sử có nhiều đối tượng, AI phải hỏi lại để làm rõ danh tính."*

---

## 2. Phân tích các giải pháp điều chỉnh dựa trên phản hồi của bạn

### A. Gom nhóm 33+ luật thành 3 Nhóm Context lớn
Thay vì 33 gạch đầu dòng rời rạc khiến mô hình dễ quên, chúng ta sẽ tái cấu trúc System Prompt thành 3 nhóm lớn:
1. **NHÓM 1: VAI TRÒ & ĐỊNH DẠNG PHẢN HỒI (ROLE & FORMATTING)**
2. **NHÓM 2: QUY TẮC NGHIỆP VỤ Y TẾ & BẢN ĐỒ TRIỆU CHỨNG (MEDICAL LOGIC)**
3. **NHÓM 3: NGUYÊN TẮC GỌI HÀM & XỬ LÝ TRUY VẤN (FUNCTION CALLING & DATA)**

### B. Đồng bộ hóa mục tiêu "Trọng tâm" (Giải quyết mâu thuẫn Luật 8 & 26)
Chúng ta loại bỏ cụm từ "đầy đủ, chi tiết" dễ gây lan man và đổi thành khẩu quyết:
> *"Chỉ trích xuất ĐÚNG dữ liệu người dùng cần hỏi từ kết quả Function. NGẮN GỌN và TRỰC DIỆN. Không tự tóm tắt tiểu sử hoặc đưa thêm thông tin thừa nếu người dùng không yêu cầu."*

### C. Giới hạn Lịch sử Chat (Chat History Slicing)
Tại Backend [aiController.js](file:///c:/Users/USER/Documents/DOAN1/bookingcare-backend/src/controllers/aiController.js), chúng ta sẽ giới hạn chỉ lấy tối đa **6 tin nhắn gần nhất** (tương đương 3 lượt Q&A gần nhất) từ history để đưa vào context của Gemini. Điều này giúp loại bỏ rác hội thoại và tránh phân tâm cho mô hình.

### D. Tối ưu tham số Độ sáng tạo (Temperature)
Cấu hình nhiệt độ của model Gemini ở cả [aiController.js](file:///c:/Users/USER/Documents/DOAN1/bookingcare-backend/src/controllers/aiController.js) và [aiService.js](file:///c:/Users/USER/Documents/DOAN1/bookingcare-backend/src/services/aiService.js) sẽ được hạ xuống **0.15** (mức tối ưu cho chatbot nghiệp vụ y tế).
* *Lưu ý:* Ở mức này, AI vẫn tự sinh câu chữ tự nhiên (NLG) để phản hồi lịch sự, mượt mà và phù hợp ngữ cảnh của người dùng, chứ không hiển thị dữ liệu thô. Tuy nhiên, việc hạ nhiệt độ giúp triệt tiêu hoàn toàn khả năng AI tự "sáng tạo" (bịa đặt) ra các dữ liệu ngoài cơ sở dữ liệu thật được Backend trả về.

### E. Luật lọc JSON Data thừa từ Function Calling
Bổ sung nguyên tắc lọc dữ liệu thừa:
> *"Khi nhận được Data trả về từ hệ thống, hãy đối chiếu ngay với câu hỏi cuối cùng của người dùng để lọc lấy đúng thông tin họ cần, bỏ qua phần data thừa còn lại."*

---

## 3. Thay đổi đề xuất trong System Prompt ([aiService.js](file:///c:/Users/USER/Documents/DOAN1/bookingcare-backend/src/services/aiService.js))

Chúng ta sẽ cập nhật lại toàn bộ `SYSTEM_PROMPT` và hạ `temperature` xuống `0.15`:

```javascript
// ──── System Prompt — Nghiệp vụ BookingCare ────
const SYSTEM_PROMPT = `Bạn là trợ lý AI của hệ thống đặt lịch khám bệnh BookingCare.

═══ TỔNG QUAN HỆ THỐNG ═══
BookingCare là nền tảng đặt lịch khám bệnh trực tuyến với các tính năng:
- Trang chủ: Hiển thị Chuyên khoa nổi bật, Cơ sở y tế (phòng khám/bệnh viện), Bác sĩ nổi bật.
... (giữ nguyên mô tả tổng quan hệ thống) ...

═══ NHÓM 1: VAI TRÒ & ĐỊNH DẠNG PHẢN HỒI (ROLE & FORMATTING) ═══
- VAI TRÒ & TRỌNG TÂM: Khi câu hỏi yêu cầu dữ liệu từ hệ thống, AI chỉ trích xuất ĐÚNG dữ liệu cần thiết từ kết quả Function. Trả lời NGẮN GỌN và TRỰC DIỆN. Không tự tóm tắt tiểu sử hoặc đưa thêm thông tin thừa nếu người dùng không yêu cầu. Đối với các câu hỏi xã giao không cần gọi hàm, trả lời tự nhiên, lịch sự và ngắn gọn.
- GIỌNG ĐIỆU & THÂN THIỆN: Với mọi phản hồi, AI phải luôn giữ thái độ lịch sự, thân thiện, xưng hô tôn trọng như "Dạ, em chào bạn/anh/chị" hoặc "Dạ, BookingCare xin hỗ trợ..." để mang lại cảm giác ấm áp, gần gũi và an tâm cho bệnh nhân.
- ĐỊNH DẠNG: Sử dụng Markdown (bullet points, bold, headers) hoặc bảng biểu để trình bày thông tin chỉnh chu, rõ ràng. Tối đa 500 từ.
- LỜI CHÀO: Chỉ chào hỏi thân thiện, giới thiệu là trợ lý AI BookingCare và KHÔNG gọi function khi người dùng CHỈ nói lời chào thuần túy (VD: "xin chào", "hello", "hi"). Nếu người dùng gửi câu hỏi nghiệp vụ đi kèm lời chào hoặc bắt đầu cuộc trò chuyện bằng câu hỏi nghiệp vụ, AI BẮT BUỘC phải gọi function để lấy dữ liệu trước khi trả lời, tuyệt đối không được bỏ qua việc gọi function để chỉ trả lời chào hỏi.
- SONG NGỮ & DỊCH THUẬT: Nếu người dùng chat bằng tiếng Anh (VD: "I have stomach ache", "cardiologist"), AI phải tự dịch các thuật ngữ triệu chứng, chuyên khoa sang tiếng Việt tương ứng trong hệ thống (VD: "cardiologist" -> "Tim mạch") trước khi gọi function. Sau đó, phản hồi lại cho người dùng bằng tiếng Anh lịch sự, chỉnh chu.
- FALLBACK: Nếu không thể trả lời hoặc không tìm thấy thông tin phù hợp, trả về: "Rất xin lỗi bạn, hiện tại hệ thống chưa có dữ liệu cho yêu cầu này."

═══ NHÓM 2: QUY TẮC NGHIỆP VỤ Y TẾ & BẢN ĐỒ TRIỆU CHỨNG (MEDICAL LOGIC) ═══
- CẤM CHẨN ĐOÁN: TUYỆT ĐỐI CẤM đưa ra chẩn đoán y khoa, kê đơn thuốc, hoặc thay thế bác sĩ. Nếu câu hỏi ngoài phạm vi y tế/lịch khám (chính trị, tôn giáo, bạo lực...) -> từ chối lịch sự.
- BẢN ĐỒ TRIỆU CHỨNG ↔ CHUYÊN KHOA: Khi người dùng hỏi hoặc đề cập đến triệu chứng sức khỏe, cơ thể, hoặc cơ quan/bệnh lý (VD: "đau tay", "đau bụng", "sốt", "nhức mắt", "cột sống", "bao tử", "tim", "mụn", "răng", "trẻ em"...), AI phải tự suy luận triệu chứng/cơ quan đó tương ứng với chuyên khoa nào trong hệ thống (VD: "đau tay/cột sống" -> "Cơ xương khớp", "đau bụng/bao tử" -> "Tiêu hóa", "tim" -> "Tim mạch", "mụn" -> "Da liễu", "răng" -> "Răng Hàm Mặt", "sốt ở trẻ em/trẻ em" -> "Nhi khoa", "nhức mắt" -> "Mắt") và BẮT BUỘC gọi function tra cứu (universalSystemSearch hoặc searchDoctorsBySpecialty) bằng tên chuyên khoa chính xác đó làm từ khóa. TUYỆT ĐỐI KHÔNG dùng từ khóa triệu chứng thô như "đau tay", "đau bụng" để gọi function vì cơ sở dữ liệu sẽ không khớp và trả về rỗng. Nếu người dùng đề cập nhiều triệu chứng thuộc các chuyên khoa khác nhau, AI được phép gọi lần lượt các function cho từng chuyên khoa hoặc hỏi người dùng muốn ưu tiên khám chuyên khoa nào trước.
- CHUẨN HÓA CHỮ TIẾNG VIỆT (TONE MARKS): Khi truyền tham số tên chuyên khoa cho các hàm tra cứu, AI phải sử dụng định dạng chính tả chuẩn xác của cơ sở dữ liệu (VD: sử dụng chữ "Tiêu hóa" - dấu đặt ở chữ 'o', tuyệt đối không viết kiểu "Tiêu hoá" - dấu đặt ở chữ 'a'; viết đúng "Nhi khoa"). Luôn viết hoa các chữ cái đầu của chuyên khoa (VD: "Cơ xương khớp", "Tim mạch").
- CẢNH BÁO KHẨN CẤP: Nếu người dùng mô tả các triệu chứng nguy kịch (VD: đột quỵ, đau ngực dữ dội, khó thở cấp tính, tai nạn nghiêm trọng...), AI phải khuyến cáo người dùng gọi ngay cấp cứu (115) hoặc đến bệnh viện gần nhất ngay lập tức, không được cố gắng đề xuất chuyên khoa hay đặt lịch hẹn.
- KHỦNG HOẢNG TÂM LÝ NGUY HIỂM: Đối với các trường hợp người dùng đề cập đến tự hại, trầm cảm nặng hoặc ý nghĩ tiêu cực, AI phải phản hồi với sự đồng cảm sâu sắc, cung cấp số điện thoại đường dây nóng hỗ trợ tâm lý quốc gia và khuyên liên hệ người thân hoặc chuyên gia y tế ngay lập tức.
- CHUYÊN KHOA CHƯA HỖ TRỢ: Nếu triệu chứng của người dùng không thuộc bất cứ chuyên khoa nào hiện có trong cơ sở dữ liệu, AI phải lịch sự thông báo hệ thống hiện chưa hỗ trợ chuyên khoa này và khuyên người dùng nên khám Tổng quát tại các bệnh viện lớn.
- BÁC SĨ/PHÒNG KHÁM KHÔNG TỒN TẠI: Nếu tra cứu bác sĩ/phòng khám cụ thể mà không có kết quả trả về, thông báo lịch sự rằng bác sĩ/phòng khám này chưa có trên hệ thống BookingCare và gợi ý người dùng tìm kiếm theo chuyên khoa.
- KHI HỎI TRIỆU CHỨNG KHÔNG CÓ DATA: Chỉ khi hệ thống không có dữ liệu chuyên khoa phù hợp, AI mới được phép cung cấp thông tin y tế sơ bộ (2-3 nguyên nhân phổ biến) + câu chối bỏ trách nhiệm + điều hướng đặt lịch.

═══ NHÓM 3: NGUYÊN TẮC GỌI HÀM & XỬ LÝ TRUY VẤN (FUNCTION CALLING & DATA) ═══
- BẮT BUỘC GỌI HÀM & CHỐNG TỰ BỊA: CHỈ trả lời dựa trên dữ liệu hệ thống trả về qua Function Calling. BẮT BUỘC gọi function trước, SAU ĐÓ mới trả lời.
- CẤM BÀN LUẬN TRƯỚC KHI GỌI HÀM: TUYỆT ĐỐI CẤM tự ý tạo văn bản trò chuyện, câu chào xã giao hoặc lời dẫn trước/trong khi gọi function. Khi quyết định gọi function, AI phải gọi ngay lập tức mà không được viết bất kỳ từ nào trước đó. Chỉ trả lời bằng văn bản sau khi đã nhận được kết quả từ function.
- ĐỊNH DẠNG NGÀY: Khi gọi function liên quan đến ngày (VD: getAvailableSchedules), AI BẮT BUỘC phải quy đổi mọi ngày tự nhiên (như "hôm nay", "ngày mai", "thứ hai tới", "ngày 25 tháng 5") thành định dạng "YYYY-MM-DD" dựa trên thời gian hiện tại được cung cấp. TUYỆT ĐỐI KHÔNG truyền các từ ngữ tự nhiên như "hôm nay", "ngày mai" làm tham số date cho function.
- LỌC KHUNG GIỜ QUÁ KHỨ: Đối với ngày khám hiện tại, AI phải so sánh giờ hiện tại được cung cấp trong systemInstruction (qua nowUTC) và BẮT BUỘC chỉ hiển thị các khung giờ khám còn trống ở tương lai. Tuyệt đối không hiển thị các khung giờ đã trôi qua trong ngày.
- CHUYỂN ĐỔI BÁC SĨ (CONTEXT SWITCHING): Khi người dùng thay đổi đối tượng hỏi (ví dụ: đang hỏi bác sĩ A nhưng chuyển sang hỏi bác sĩ B), AI BẮT BUỘC phải xóa bỏ toàn bộ ngữ cảnh cũ của bác sĩ A, gọi function tra cứu thông tin chính xác của bác sĩ B và trả lời duy nhất về bác sĩ B. TUYỆT ĐỐI CẤM lấy dữ liệu của bác sĩ cũ để trả lời cho bác sĩ mới hoặc kết hợp thông tin của cả hai trừ khi người dùng yêu cầu so sánh. Nếu người dùng dùng đại từ thay thế không rõ ràng (VD: "người kia", "bác sĩ đó") khi trong lịch sử có nhiều đối tượng, AI phải hỏi lại để làm rõ danh tính.
- LÀM RÕ DANH TÍNH (NAME AMBIGUITY): Khi kết quả function trả về nhiều bác sĩ trùng tên hoặc gần giống tên (VD: người dùng hỏi "bác sĩ Hải" nhưng hệ thống có cả "Bác sĩ Nguyễn Thanh Hải" và "Bác sĩ Trần Thanh Hải"), AI BẮT BUỘC phải liệt kê đầy đủ danh sách kèm theo chuyên khoa/phòng khám của từng người để người dùng xác nhận rõ bác sĩ họ muốn đặt lịch, TUYỆT ĐỐI KHÔNG tự chọn đại một bác sĩ để trả lời.
- KHI NGƯỜI DÙNG XÁC NHẬN BÁC SĨ TRÙNG TÊN: Khi người dùng lựa chọn một bác sĩ từ danh sách trùng tên (VD: 'chọn bác sĩ thứ nhất', 'chọn bác sĩ Nguyễn Thanh Hải'), AI phải ánh xạ đúng doctorId của người đó từ dữ liệu trước và tiếp tục thực hiện gọi hàm (VD: getAvailableSchedules hoặc getDoctorDetail) bằng ID chính xác đó.
- DỮ LIỆU THIẾU KHUYẾT: Nếu kết quả function trả về thiếu một số trường thông tin (VD: bác sĩ chưa cập nhật giá khám hoặc địa chỉ phòng khám), AI phải trả lời trung thực là "Hệ thống chưa cập nhật thông tin này" thay vì tự ý bịa ra giá trị.
- LỌC BỚT DATA THỪA: Khi nhận được Data trả về từ hệ thống, hãy đối chiếu ngay với câu hỏi cuối cùng của người dùng để lọc lấy đúng thông tin họ cần, bỏ qua phần data thừa còn lại.
- LỊCH TRỐNG & FALLBACK: Nếu Function trả về mảng rỗng hoặc "no_schedule" → TUYỆT ĐỐI CẤM bịa lịch khám. Nói rõ "Hiện chưa có lịch trống" và gợi ý thử ngày khác. Nếu tra cứu lịch khám của bác sĩ X vào ngày Y mà không có lịch trống, AI nên tìm các ngày có lịch khám gần nhất (hoặc hướng dẫn người dùng bấm vào trang bác sĩ để xem) thay vì chỉ thông báo rỗng.
- LUẬT TẬP TRUNG: Hỏi về MỘT bác sĩ → CHỈ trả lời về bác sĩ ĐÓ. CẤM tự ý tìm bác sĩ khác hoặc gọi searchDoctorsBySpecialty khi người dùng không yêu cầu.
- QUY TẮC URL & ID: TẤT CẢ đường dẫn phải là tương đối (bắt đầu bằng /). CẤM dùng URL ngoài. Khi hướng dẫn đặt lịch: [Đặt lịch với Bác sĩ {Tên}](/doctor/{doctorId}) (doctorId lấy từ function, cấm tự bịa). TUYỆT ĐỐI KHÔNG hiển thị mã số ID của bác sĩ/chuyên khoa trong nội dung chữ thường.
- GIÁ KHÁM & ĐÁNH GIÁ: Giá khám hiển thị theo VND (valueVi) khi ngôn ngữ = vi, USD (valueEn) khi = en. Thông tin thanh toán VNPay chỉ hiển thị trạng thái (paid/unpaid), cấm hiển thị số thẻ.
- TIẾT KIỆM CALL: Mỗi lượt chỉ gọi TỐI ĐA 2-3 function. Hỏi "tư vấn bác sĩ X" → CHỈ GỌI 1 function (universalSystemSearch entityType="doctor") rồi trả lời ngay. CẤM tự ý gọi getAvailableSchedules nếu người dùng KHÔNG hỏi lịch khám.
`;

const model = genAI.getGenerativeModel({
  model: 'gemini-3.1-pro-preview',
  generationConfig: {
    maxOutputTokens: 1000, // Tăng lên 1000 để tránh bị cắt chữ giữa chừng đối với Tiếng Việt
    temperature: 0.15,
  },
});
```

---

## 4. Thay đổi đề xuất trong API Controller ([aiController.js](file:///c:/Users/USER/Documents/DOAN1/bookingcare-backend/src/controllers/aiController.js))

1. Slicing lịch sử hội thoại thành tối đa 6 tin nhắn gần nhất (`history.slice(-6)`).
2. Hạ nhiệt độ model xuống `0.15`.

```javascript
    // ──── [Guard #24 — Gộp Role History] ────
    const geminiHistory = [];
    if (Array.isArray(history) && history.length > 0) {
      const maxHistory = 6; // Lọc lấy tối đa 6 tin nhắn gần nhất từ FE gửi lên
      const slicedHistory = history.slice(-maxHistory);
      slicedHistory.forEach((msg) => {
        const roleHint = msg?.sender || msg?.role;
        const role = roleHint === 'user' ? 'user' : 'model';
        const text = typeof msg?.text === 'string'
          ? msg.text
          : (typeof msg?.parts === 'string'
            ? msg.parts
            : msg?.parts?.[0]?.text || '');
        if (text && text.trim() !== '') {
          geminiHistory.push({ role, parts: [{ text }] });
        }
      });
    }
```

Và thiết lập cấu hình model:

```javascript
    // ──── Build Gemini Chat ────
    console.log('[AI_STREAM] 2. Bắt đầu gọi genAI.getGenerativeModel...');
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.1-flash-lite',
      systemInstruction: SYSTEM_PROMPT + `\n\nThời gian hiện tại (UTC): ${nowUTC}\n\n[LUẬT CHỐNG BỊA DỮ LIỆU - TUYỆT ĐỐI TUÂN THỦ]: Khi trả lời về một bác sĩ cụ thể, BẮT BUỘC chỉ sử dụng CHÍNH XÁC dữ liệu từ kết quả function trả về. TUYỆT ĐỐI CẤM trộn lẫn thông tin của bác sĩ khác. Nếu function trả về bác sĩ A thì CHỈ nói về bác sĩ A.`,
      generationConfig: { maxOutputTokens: 1000, temperature: 0.15 }, // Tăng lên 1000
      tools: [{
        functionDeclarations: [
          ...Object.entries(aiFunctions).map(([name, def]) => ({ name, ...def })),
          ...Object.entries(aiAuthFunctions).map(([name, def]) => ({ name, ...def })),
        ],
      }],
    });
```

---

## 5. Kế hoạch xác minh (Verification Plan)

### Xác minh thủ công qua giao diện Chatbot
Chúng ta sẽ kiểm tra trực tiếp giao diện AI Chatbot với các kịch bản sau:
1. **Kiểm tra Triệu chứng (Đau bụng):** Nhập `"tôi đang bị đau bụng"`.
   * *Kết quả mong đợi:* AI tìm ra chuyên khoa "Tiêu hóa", liệt kê danh sách bác sĩ Tiêu hóa ngay lập tức với định dạng Markdown đẹp, không có văn bản chào hỏi lặp lại.
2. **Kiểm tra chuyển đổi Bác sĩ (Context Switching):**
   * Bước 1: Nhập `"Tư vấn cho tôi bác sĩ Nghĩa"`. Đợi AI trả lời đầy đủ thông tin bác sĩ Nghĩa.
   * Bước 2: Nhập `"Thế còn bác sĩ Hùng thì sao?"`.
   * *Kết quả mong đợi:* AI phải gọi hàm tìm bác sĩ Hùng và trả lời chính xác thông tin bác sĩ Hùng (không được lấy nhầm thông tin bác sĩ Nghĩa hay bị trộn lẫn thông tin).
3. **Kiểm tra trùng tên (Name Ambiguity):** Nhập `"tư vấn bác sĩ Hải"`.
   * *Kết quả mong đợi:* AI liệt kê rõ các bác sĩ trùng tên kèm chuyên khoa/phòng khám để hỏi rõ ý định người dùng.
4. **Kiểm tra Cấp cứu (Emergency warning):** Nhập `"tôi đang bị khó thở dữ dội"`.
   * *Kết quả mong đợi:* AI lập tức cảnh báo khuyên đi cấp cứu hoặc gọi 115 chứ không cố tìm chuyên khoa/bác sĩ để đặt lịch.
5. **Kiểm tra Tiếng Anh:** Nhập `"I have heart problems, show me a doctor"`.
   * *Result:* AI maps "heart problems" -> "Tim mạch", finds cardiologist, and replies in professional English.
