# Software Requirements Specification

## for

## Hệ Thống Đặt Lịch Khám Bệnh Trực Tuyến Tích Hợp Quản Lý Phòng Khám Và Chuyên Khoa

## (Online Medical Appointment Booking Application with Clinic and Specialty Management)

**Version 1.2**

**Prepared by:** Trần Đức Hải (23520421) & Đặng Ngọc Trường Giang (23520406)

**Organization:** Trường Đại Học Công Nghệ Thông Tin – Đại Học Quốc Gia TP. Hồ Chí Minh (UIT – VNU-HCM)

**Date Created:** 04/03/2026

**Instructor:** ThS. Trần Anh Dũng

---

## Table of Contents

- [1. Introduction](#1-introduction)
  - [1.1 Document Purpose](#11-document-purpose)
  - [1.2 Document Conventions](#12-document-conventions)
  - [1.3 Project Scope](#13-project-scope)
  - [1.4 References](#14-references)
- [2. Overall Description](#2-overall-description)
  - [2.1 Product Perspective](#21-product-perspective)
  - [2.2 User Classes and Characteristics](#22-user-classes-and-characteristics)
  - [2.3 Operating Environment](#23-operating-environment)
  - [2.4 Design and Implementation Constraints](#24-design-and-implementation-constraints)
  - [2.5 Assumptions and Dependencies](#25-assumptions-and-dependencies)
- [3. System Features](#3-system-features)
  - [3.1 User Authentication and Authorization](#31-user-authentication-and-authorization)
  - [3.2 Admin – User Management (CRUD)](#32-admin--user-management-crud)
  - [3.3 Admin – Doctor Management](#33-admin--doctor-management)
  - [3.4 Admin – Clinic Management](#34-admin--clinic-management)
  - [3.5 Admin – Specialty Management](#35-admin--specialty-management)
  - [3.6 Admin – Doctor Schedule Management](#36-admin--doctor-schedule-management)
  - [3.7 Patient – Homepage and Search](#37-patient--homepage-and-search)
  - [3.8 Patient – View Doctor Details](#38-patient--view-doctor-details)
  - [3.9 Patient – Appointment Booking](#39-patient--appointment-booking)
  - [3.10 Patient – Email Verification](#310-patient--email-verification)
  - [3.11 Doctor – Appointment Dashboard](#311-doctor--appointment-dashboard)
  - [3.12 Doctor – Patient Detail View](#312-doctor--patient-detail-view)
  - [3.13 Doctor – Send Medical Results via Email](#313-doctor--send-medical-results-via-email)
  - [3.14 Social Integration (Facebook Plugin)](#314-social-integration-facebook-plugin)
  - [3.15 Chatbot Integration (Facebook Messenger)](#315-chatbot-integration-facebook-messenger)
- [4. Data Requirements](#4-data-requirements)
- [5. External Interface Requirements](#5-external-interface-requirements)
- [6. Quality Attributes](#6-quality-attributes)
- [7. Internationalization and Localization Requirements](#7-internationalization-and-localization-requirements)
- [8. Other Requirements](#8-other-requirements)
- [9. Glossary](#9-glossary)
- [10. Analysis Models](#10-analysis-models)
  - [10.1 Use Case Diagram – Tổng quan](#101-use-case-diagram--tổng-quan)
  - [10.2 Use Case Diagram – Module Admin](#102-use-case-diagram--module-admin)
  - [10.3 Use Case Diagram – Module Bệnh nhân](#103-use-case-diagram--module-bệnh-nhân)
  - [10.4 Use Case Diagram – Module Bác sĩ](#104-use-case-diagram--module-bác-sĩ)
  - [10.5 Sequence Diagram – Quy trình đặt lịch khám](#105-sequence-diagram--quy-trình-đặt-lịch-khám)

---

## Revision History

| **Name**                             | **Date**   | **Reason For Changes**                                                                                                                             | **Version** |
| :----------------------------------- | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------- | :---------- |
| Trần Đức Hải, Đặng Ngọc Trường Giang | 04/03/2026 | Initial SRS creation                                                                                                                               | 1.0         |
| Trần Đức Hải, Đặng Ngọc Trường Giang | 04/03/2026 | Refined: added Allcode sample data, error handling requirements, future development section, improved user class details                           | 1.1         |
| Trần Đức Hải, Đặng Ngọc Trường Giang | 04/03/2026 | Deep review: added booking state machine, API request/response specs, admin menu items, image constraints, Doctor_Info fields, errCode conventions | 1.2         |

---

## 1. Introduction

Tài liệu này trình bày đặc tả yêu cầu phần mềm (SRS) cho hệ thống "Đặt lịch khám bệnh trực tuyến tích hợp quản lý phòng khám và chuyên khoa". Tài liệu được tổ chức theo chuẩn IEEE 830 / Karl Wiegers SRS Template, bao gồm: giới thiệu, mô tả tổng quan, các tính năng hệ thống, yêu cầu dữ liệu, giao diện, chất lượng, quốc tế hóa và các yêu cầu khác.

### 1.1 Document Purpose

Tài liệu SRS này đặc tả đầy đủ các yêu cầu phần mềm cho hệ thống **"Online Medical Appointment Booking Application with Clinic and Specialty Management"** – Phiên bản 1.2.

**Đối tượng đọc tài liệu:**

- **Developers (Lập trình viên):** Hiểu rõ yêu cầu chức năng và phi chức năng để cài đặt hệ thống.
- **Project Manager / Instructor (Giảng viên hướng dẫn):** Đánh giá phạm vi, tiến độ và chất lượng dự án.
- **Testers (Kiểm thử viên):** Xây dựng test case dựa trên yêu cầu chức năng.
- **End Users (Bệnh nhân, Bác sĩ, Admin):** Hiểu các chức năng hệ thống cung cấp.

### 1.2 Document Conventions

- **Bold text:** Dùng để nhấn mạnh thuật ngữ quan trọng hoặc tên tính năng.
- **[REQ-XX-YYY]:** Mã định danh yêu cầu, trong đó XX là mã module (AU = Authentication, AM = Admin Management, PT = Patient, DR = Doctor, SI = Social Integration, CB = Chatbot) và YYY là số thứ tự.
- **Priority levels:** High (Bắt buộc), Medium (Quan trọng), Low (Tùy chọn/Nâng cao).
- **Italic text:** Mô tả bổ sung hoặc ghi chú.

### 1.3 Project Scope

Hệ thống **"Đặt lịch khám bệnh trực tuyến"** là một ứng dụng web fullstack cho phép:

- **Bệnh nhân** tìm kiếm bác sĩ theo chuyên khoa/phòng khám, xem thông tin chi tiết và đặt lịch khám bệnh trực tuyến với quy trình 4 bước (Chọn bác sĩ/khung giờ → Điền thông tin cá nhân → Xác nhận đặt lịch → Xác thực qua email).
- **Bác sĩ** quản lý lịch hẹn, xem thông tin bệnh nhân, cập nhật trạng thái lịch hẹn và gửi kết quả khám/hóa đơn qua email.
- **Quản trị viên (Admin)** quản lý toàn bộ hệ thống bao gồm CRUD người dùng, bác sĩ, phòng khám, chuyên khoa với phân quyền role-based.

Hệ thống được xây dựng nhằm mục tiêu giảm tải cho hệ thống y tế, rút ngắn thời gian chờ đợi của bệnh nhân, và tối ưu hóa quy trình quản lý lịch khám cho phòng khám/bệnh viện. Dự án lấy cảm hứng từ các nền tảng thực tế như BookingCare.vn, Doctolib, Zocdoc.

**Các tính năng chính của phiên bản 1.0:**

- Module quản trị (Admin) với CRUD đầy đủ và phân quyền role
- Module bệnh nhân với đặt lịch khám trực tuyến và xác thực email
- Module bác sĩ với dashboard quản lý lịch hẹn
- Giao diện đa ngôn ngữ (Anh – Việt)
- Tích hợp Facebook Social Plugin và Chatbot Messenger
- Triển khai production trên Vercel (frontend) và Heroku (backend)

### 1.4 References

| #   | Tài liệu / Nguồn tham khảo           | URL / Nguồn                                                    |
| --- | ------------------------------------ | -------------------------------------------------------------- |
| 1   | React.js Official Documentation      | https://reactjs.org                                            |
| 2   | Node.js Official Documentation       | https://nodejs.org                                             |
| 3   | Express.js Official Documentation    | https://expressjs.com                                          |
| 4   | Sequelize ORM Documentation          | https://sequelize.org                                          |
| 5   | Redux Documentation                  | https://redux.js.org                                           |
| 6   | BookingCare.vn (Hệ thống tham chiếu) | https://bookingcare.vn                                         |
| 7   | Doctolib (Benchmark reference)       | https://www.doctolib.fr                                        |
| 8   | Zocdoc (Benchmark reference)         | https://www.zocdoc.com                                         |
| 9   | Facebook SDK Documentation           | https://developers.facebook.com                                |
| 10  | Nodemailer Documentation             | https://nodemailer.com                                         |
| 11  | Đề cương chi tiết đồ án 1            | Detailed_Project_Proposal_for_Language_Learning_Application.md |

---

## 2. Overall Description

### 2.1 Product Perspective

Hệ thống đặt lịch khám bệnh trực tuyến là một **sản phẩm hoàn toàn mới** được phát triển từ đầu (greenfield project) trong khuôn khổ đồ án 1 tại UIT – VNU-HCM. Hệ thống không phải là phiên bản nâng cấp của sản phẩm hiện có, mà được xây dựng dựa trên việc nghiên cứu và tham khảo các nền tảng y tế trực tuyến như BookingCare.vn, Doctolib và Zocdoc.

**Kiến trúc hệ thống Client-Server:**

```
┌─────────────────┐     HTTP/HTTPS      ┌─────────────────┐     Sequelize ORM     ┌──────────────┐
│                 │    REST API          │                 │                       │              │
│   React.js      │ ◄──────────────────► │  Node.js +      │ ◄───────────────────► │  MySQL /     │
│   Frontend      │                     │  Express.js     │                       │  PostgreSQL  │
│   (Vercel)      │                     │  Backend        │                       │  Database    │
│                 │                     │  (Heroku)       │                       │              │
└─────────────────┘                     └────────┬────────┘                       └──────────────┘
                                                 │
                                    ┌────────────┼────────────┐
                                    │            │            │
                              ┌─────▼─────┐ ┌───▼───┐  ┌────▼─────┐
                              │ Nodemailer│ │Facebook│  │ Facebook │
                              │ (Gmail    │ │ Social │  │ Messenger│
                              │  SMTP)    │ │ Plugin │  │ Chatbot  │
                              └───────────┘ └───────┘  └──────────┘
```

**Các thành phần chính:**

- **Frontend (Client):** Ứng dụng React.js SPA, giao tiếp với backend qua RESTful API.
- **Backend (Server):** Node.js + Express.js, xử lý business logic, authentication, và API endpoints.
- **Database:** MySQL (development) / PostgreSQL (production), quản lý qua Sequelize ORM.
- **External Services:** Gmail SMTP (email), Facebook SDK (social plugin), Facebook Messenger (chatbot).

### 2.2 User Classes and Characteristics

| User Class                | Mô tả                                                                                                     | Đặc điểm                                                                                                | Tần suất sử dụng                       | Trình độ kỹ thuật | Mức độ ưu tiên                 |
| ------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------- | ------------------------------ |
| **Bệnh nhân (Patient)**   | Người có nhu cầu đặt lịch khám bệnh trực tuyến, tìm kiếm bác sĩ theo chuyên khoa hoặc phòng khám          | Không cần kiến thức kỹ thuật; cần giao diện đơn giản, trực quan; sử dụng trên cả desktop và mobile      | Không thường xuyên (khi cần khám bệnh) | Thấp – Trung bình | **Favored** (Ưu tiên cao nhất) |
| **Bác sĩ (Doctor)**       | Bác sĩ/chuyên gia y tế sử dụng hệ thống để quản lý lịch khám và bệnh nhân                                 | Quen thuộc với quy trình y tế; cần dashboard rõ ràng để quản lý lịch hẹn; thao tác chủ yếu trên desktop | Hàng ngày (trong giờ làm việc)         | Trung bình        | **Important**                  |
| **Quản trị viên (Admin)** | Người quản lý toàn bộ hệ thống, được phân quyền đầy đủ CRUD và quản lý nội dung trang (bài viết markdown) | Có kiến thức về quản trị hệ thống; cần quyền truy cập đầy đủ CRUD; thao tác trên desktop                | Thường xuyên (quản lý hệ thống)        | Cao               | **Important**                  |

### 2.3 Operating Environment

- **Client-side:**
  - Trình duyệt web: Google Chrome (v90+), Mozilla Firefox (v80+), Microsoft Edge (v90+), Safari (v14+)
  - Hệ điều hành: Windows 10/11, macOS, Linux, iOS, Android
  - Hỗ trợ responsive: Desktop (≥1024px) và Mobile (≤768px)

- **Server-side:**
  - **Development:** Local machine với Node.js (v14+), MySQL (XAMPP), npm
  - **Production:**
    - Frontend: Vercel (HTTPS tự động, CDN toàn cầu)
    - Backend: Heroku (Node.js runtime)
    - Database: Heroku Postgres / ClearDB MySQL

- **Third-party Services:**
  - Gmail SMTP (Nodemailer)
  - Facebook Developer Platform (Social Plugin + Messenger)

### 2.4 Design and Implementation Constraints

| #   | Ràng buộc               | Mô tả                                                                                                                                                                        |
| --- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Ngôn ngữ lập trình**  | Frontend và Backend đều sử dụng JavaScript                                                                                                                                   |
| 2   | **Frontend Framework**  | Bắt buộc sử dụng React.js                                                                                                                                                    |
| 3   | **Backend Framework**   | Bắt buộc sử dụng Node.js + Express.js                                                                                                                                        |
| 4   | **ORM**                 | Sử dụng Sequelize ORM (hỗ trợ cả MySQL và PostgreSQL)                                                                                                                        |
| 5   | **State Management**    | Redux (redux-persist, redux-thunk)                                                                                                                                           |
| 6   | **Database**            | MySQL cho development, PostgreSQL cho production                                                                                                                             |
| 7   | **Image Storage**       | Hình ảnh lưu dưới dạng BLOB/base64 trong database. Kích thước tối đa mỗi ảnh: 5MB. Định dạng hỗ trợ: JPEG, PNG. Frontend chuyển đổi ảnh sang base64 string trước khi gửi API |
| 8   | **Email Service**       | Giới hạn bởi Gmail SMTP quota (500 email/ngày cho tài khoản miễn phí)                                                                                                        |
| 9   | **Hosting**             | Vercel (free tier) cho frontend, Heroku (free/hobby tier) cho backend                                                                                                        |
| 10  | **Version Control**     | Git + GitHub                                                                                                                                                                 |
| 11  | **Thời gian thực hiện** | Từ 02/2026 đến 06/2026                                                                                                                                                       |

### 2.5 Assumptions and Dependencies

**Assumptions (Giả định):**

- Người dùng có kết nối Internet ổn định.
- Người dùng sử dụng trình duyệt web hiện đại hỗ trợ JavaScript ES6+.
- Bệnh nhân có địa chỉ email hợp lệ để xác thực lịch hẹn.
- Bác sĩ và Admin được cấp tài khoản bởi quản trị viên hệ thống.
- Dữ liệu bác sĩ, phòng khám, chuyên khoa được Admin nhập liệu ban đầu.

**Dependencies (Phụ thuộc):**

- **Gmail SMTP Service:** Hệ thống phụ thuộc vào dịch vụ Gmail để gửi email xác thực và thông báo.
- **Facebook Developer Platform:** Tích hợp Social Plugin và Messenger Chatbot phụ thuộc vào Facebook API.
- **Heroku Platform:** Backend và database production phụ thuộc vào Heroku hosting service.
- **Vercel Platform:** Frontend production phụ thuộc vào Vercel hosting service.
- **npm packages:** Hệ thống phụ thuộc vào các thư viện third-party (React, Redux, Sequelize, Nodemailer, v.v.).

---

## 3. System Features

Phần này mô tả chi tiết các tính năng chức năng của hệ thống, được tổ chức theo 3 module chính (Admin, Bệnh nhân, Bác sĩ) và 2 module tích hợp (Social Plugin, Chatbot). Mỗi tính năng bao gồm: mô tả, chuỗi kích thích/phản hồi (Stimulus/Response), và danh sách yêu cầu chức năng cụ thể với mã định danh [REQ-XX-YYY].

**Tổng quan các tính năng theo module:**

| Module             | Tính năng                                                                                                          | Priority    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----------- |
| **Authentication** | 3.1 Xác thực và Phân quyền                                                                                         | High        |
| **Admin**          | 3.2 Quản lý người dùng, 3.3 Quản lý bác sĩ, 3.4 Quản lý phòng khám, 3.5 Quản lý chuyên khoa, 3.6 Quản lý lịch khám | High        |
| **Bệnh nhân**      | 3.7 Trang chủ & Tìm kiếm, 3.8 Xem chi tiết bác sĩ, 3.9 Đặt lịch khám, 3.10 Xác thực email                          | High        |
| **Bác sĩ**         | 3.11 Dashboard lịch hẹn, 3.12 Xem bệnh nhân, 3.13 Gửi kết quả qua email                                            | High–Medium |
| **Tích hợp**       | 3.14 Facebook Social Plugin, 3.15 Chatbot Messenger                                                                | Medium      |

### 3.1 User Authentication and Authorization

#### 3.1.1 Description

Hệ thống cung cấp chức năng xác thực người dùng (đăng nhập) và phân quyền truy cập dựa trên role (Admin, Bác sĩ, Bệnh nhân). **Priority: High.**

#### 3.1.2 Stimulus/Response Sequences

| #   | User Action                                           | System Response                                                                |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Người dùng nhập email và mật khẩu tại trang đăng nhập | Hệ thống xác thực thông tin, kiểm tra role và chuyển hướng đến trang tương ứng |
| 2   | Người dùng đăng nhập với thông tin sai                | Hệ thống hiển thị thông báo lỗi                                                |
| 3   | Người dùng truy cập trang không có quyền              | Hệ thống chuyển hướng về trang đăng nhập hoặc trang chủ                        |
| 4   | Admin tạo tài khoản mới cho bác sĩ/người dùng         | Hệ thống tạo tài khoản với role được chỉ định                                  |

#### 3.1.3 Functional Requirements

- **[REQ-AU-001]:** Hệ thống phải hỗ trợ đăng nhập bằng email và mật khẩu.
- **[REQ-AU-002]:** Mật khẩu phải được mã hóa bằng bcryptjs (salt rounds = 10) trước khi lưu vào database.
- **[REQ-AU-003]:** Hệ thống phải hỗ trợ quản lý phiên đăng nhập (session) bằng express-session hoặc JWT.
- **[REQ-AU-004]:** Hệ thống phải phân quyền theo 3 role: Admin (R1), Doctor (R2), Patient (R3).
- **[REQ-AU-005]:** Menu quản trị phải hiển thị động theo role của người dùng đăng nhập:
  - **Admin (R1):** Quản lý người dùng, Quản lý bác sĩ, Quản lý lịch khám bác sĩ, Quản lý phòng khám, Quản lý chuyên khoa.
  - **Doctor (R2):** Quản lý lịch hẹn bệnh nhân.
  - **Patient (R3):** Không có menu quản trị (chỉ truy cập trang công khai).
- **[REQ-AU-006]:** Hệ thống phải tự động logout khi session hết hạn.
- **[REQ-AU-007]:** Hệ thống phải hiển thị thông báo lỗi cụ thể khi đăng nhập thất bại (sai email hoặc sai mật khẩu).
- **[REQ-AU-008]:** Hệ thống phải chặn truy cập các route được bảo vệ khi chưa đăng nhập (redirect về trang login).
- **[REQ-AU-009]:** Sau khi đăng nhập thành công, hệ thống phải lưu thông tin user vào Redux store (redux-persist lưu vào localStorage) bao gồm: id, email, roleId, firstName, lastName.

---

### 3.2 Admin – User Management (CRUD)

#### 3.2.1 Description

Admin có quyền quản lý toàn bộ tài khoản người dùng trong hệ thống bao gồm tạo mới, xem, sửa, xóa và phân quyền role. **Priority: High.**

#### 3.2.2 Stimulus/Response Sequences

| #   | User Action                             | System Response                                         |
| --- | --------------------------------------- | ------------------------------------------------------- |
| 1   | Admin truy cập trang quản lý người dùng | Hệ thống hiển thị danh sách tất cả người dùng           |
| 2   | Admin nhấn "Tạo mới" và điền thông tin  | Hệ thống tạo tài khoản mới và hiển thị trong danh sách  |
| 3   | Admin nhấn "Sửa" trên một người dùng    | Hệ thống hiển thị form chỉnh sửa với thông tin hiện tại |
| 4   | Admin nhấn "Xóa" trên một người dùng    | Hệ thống xác nhận và xóa tài khoản                      |

#### 3.2.3 Functional Requirements

- **[REQ-AM-001]:** Admin phải có khả năng xem danh sách tất cả người dùng trong hệ thống.
- **[REQ-AM-002]:** Admin phải có khả năng tạo tài khoản mới với các thông tin: email, mật khẩu, họ tên, số điện thoại, địa chỉ, giới tính, role.
- **[REQ-AM-003]:** Admin phải có khả năng chỉnh sửa thông tin người dùng.
- **[REQ-AM-004]:** Admin phải có khả năng xóa tài khoản người dùng.
- **[REQ-AM-005]:** Admin phải có khả năng gán role (Admin, Doctor, Patient) cho người dùng.

---

### 3.3 Admin – Doctor Management

#### 3.3.1 Description

Admin quản lý thông tin chi tiết của bác sĩ bao gồm hồ sơ chuyên môn, chuyên khoa, và bài viết giới thiệu bằng Markdown. **Priority: High.**

#### 3.3.2 Stimulus/Response Sequences

| #   | User Action                                  | System Response                                   |
| --- | -------------------------------------------- | ------------------------------------------------- |
| 1   | Admin truy cập trang quản lý bác sĩ          | Hiển thị danh sách bác sĩ với thông tin tóm tắt   |
| 2   | Admin tạo hồ sơ bác sĩ mới                   | Hệ thống lưu thông tin bác sĩ kèm hình ảnh (BLOB) |
| 3   | Admin chỉnh sửa bài viết Markdown của bác sĩ | Hệ thống cập nhật và render lại nội dung Markdown |
| 4   | Admin xóa hồ sơ bác sĩ                       | Hệ thống xác nhận và xóa hồ sơ                    |

#### 3.3.3 Functional Requirements

- **[REQ-AM-006]:** Admin phải có khả năng tạo hồ sơ bác sĩ với các thông tin: họ tên, chuyên khoa, phòng khám, hình ảnh đại diện, mô tả chuyên môn, chức danh (positionId), giá khám (priceId), tỉnh/thành phố (provinceId), phương thức thanh toán (paymentId).
- **[REQ-AM-007]:** Admin phải có khả năng viết/chỉnh sửa bài giới thiệu bác sĩ bằng Markdown editor. Hệ thống phải lưu **đồng thời** cả 2 format: `contentMarkdown` (markdown gốc để chỉnh sửa) và `contentHTML` (HTML đã render để hiển thị cho bệnh nhân).
- **[REQ-AM-008]:** Hình ảnh bác sĩ phải được lưu trữ dưới dạng base64 BLOB trong database.
- **[REQ-AM-009]:** Admin phải có khả năng gán bác sĩ vào chuyên khoa và phòng khám cụ thể.
- **[REQ-AM-010]:** Admin phải có khả năng xóa hồ sơ bác sĩ.
- **[REQ-AM-022]:** Khi tạo hồ sơ bác sĩ, hệ thống phải kiểm tra user đã có role Doctor (R2) trước khi cho phép tạo.

---

### 3.4 Admin – Clinic Management

#### 3.4.1 Description

Admin quản lý thông tin các phòng khám / cơ sở y tế trong hệ thống. **Priority: High.**

#### 3.4.2 Stimulus/Response Sequences

| #   | User Action                             | System Response                                         |
| --- | --------------------------------------- | ------------------------------------------------------- |
| 1   | Admin truy cập trang quản lý phòng khám | Hiển thị danh sách phòng khám với hình ảnh và thông tin |
| 2   | Admin tạo phòng khám mới                | Hệ thống lưu thông tin phòng khám kèm hình ảnh          |
| 3   | Admin chỉnh sửa thông tin phòng khám    | Hệ thống cập nhật thông tin                             |

#### 3.4.3 Functional Requirements

- **[REQ-AM-011]:** Admin phải có khả năng tạo phòng khám mới với: tên, địa chỉ, hình ảnh, mô tả chi tiết.
- **[REQ-AM-012]:** Admin phải có khả năng chỉnh sửa thông tin phòng khám.
- **[REQ-AM-013]:** Admin phải có khả năng xóa phòng khám.
- **[REQ-AM-014]:** Hệ thống phải hiển thị danh sách phòng khám với hình ảnh và thông tin tóm tắt.

---

### 3.5 Admin – Specialty Management

#### 3.5.1 Description

Admin quản lý các chuyên khoa khám bệnh (nội khoa, ngoại khoa, tim mạch, da liễu, v.v.). **Priority: High.**

#### 3.5.2 Stimulus/Response Sequences

| #   | User Action                              | System Response                              |
| --- | ---------------------------------------- | -------------------------------------------- |
| 1   | Admin truy cập trang quản lý chuyên khoa | Hiển thị danh sách chuyên khoa               |
| 2   | Admin tạo chuyên khoa mới                | Hệ thống lưu chuyên khoa với tên và hình ảnh |
| 3   | Admin chỉnh sửa/xóa chuyên khoa          | Hệ thống cập nhật hoặc xóa chuyên khoa       |

#### 3.5.3 Functional Requirements

- **[REQ-AM-015]:** Admin phải có khả năng tạo chuyên khoa mới với: tên chuyên khoa, hình ảnh, mô tả.
- **[REQ-AM-016]:** Admin phải có khả năng chỉnh sửa thông tin chuyên khoa.
- **[REQ-AM-017]:** Admin phải có khả năng xóa chuyên khoa.

---

### 3.6 Admin – Doctor Schedule Management

#### 3.6.1 Description

Admin quản lý lịch khám của bác sĩ theo ngày và khung giờ cụ thể. **Priority: High.**

#### 3.6.2 Stimulus/Response Sequences

| #   | User Action                               | System Response                                               |
| --- | ----------------------------------------- | ------------------------------------------------------------- |
| 1   | Admin chọn bác sĩ và ngày cần tạo lịch    | Hiển thị form tạo lịch với các khung giờ                      |
| 2   | Admin chọn các khung giờ khả dụng (T1–T8) | Hệ thống lưu lịch khám (bulk create) cho bác sĩ trong ngày đó |
| 3   | Admin chỉnh sửa/xóa lịch đã tạo           | Hệ thống cập nhật hoặc xóa lịch                               |

#### 3.6.3 Functional Requirements

- **[REQ-AM-018]:** Admin phải có khả năng tạo lịch khám cho bác sĩ theo ngày cụ thể. Hỗ trợ tạo hàng loạt (bulk create) nhiều khung giờ trong cùng một lần gửi.
- **[REQ-AM-019]:** Hệ thống phải hỗ trợ 8 khung giờ trong một ngày: T1 (8:00-9:00), T2 (9:00-10:00), T3 (10:00-11:00), T4 (11:00-12:00), T5 (13:00-14:00), T6 (14:00-15:00), T7 (15:00-16:00), T8 (16:00-17:00).
- **[REQ-AM-020]:** Giá khám được thiết lập ở cấp bác sĩ (trong Doctor_Info.priceId), không phải từng khung giờ riêng.
- **[REQ-AM-021]:** Admin phải có khả năng xóa hoặc chỉnh sửa lịch khám đã tạo.
- **[REQ-AM-023]:** Mỗi khung giờ (Schedule) phải có trường `maxNumber` (số bệnh nhân tối đa, mặc định 10) và `currentNumber` (số bệnh nhân đã đặt, mặc định 0). Khi `currentNumber >= maxNumber`, khung giờ đó không còn khả dụng.

---

### 3.7 Patient – Homepage and Search

#### 3.7.1 Description

Trang chủ hiển thị thông tin tổng quan về hệ thống, bác sĩ nổi bật, phòng khám, chuyên khoa và thanh tìm kiếm. **Priority: High.**

#### 3.7.2 Stimulus/Response Sequences

| #   | User Action                               | System Response                                                       |
| --- | ----------------------------------------- | --------------------------------------------------------------------- |
| 1   | Bệnh nhân truy cập trang chủ              | Hiển thị carousel giới thiệu, bác sĩ nổi bật, phòng khám, chuyên khoa |
| 2   | Bệnh nhân nhập từ khóa vào thanh tìm kiếm | Hiển thị kết quả bác sĩ/chuyên khoa phù hợp                           |
| 3   | Bệnh nhân nhấn vào chuyên khoa            | Hiển thị danh sách bác sĩ theo chuyên khoa đó                         |
| 4   | Bệnh nhân nhấn vào phòng khám             | Hiển thị danh sách bác sĩ theo phòng khám đó                          |

#### 3.7.3 Functional Requirements

- **[REQ-PT-001]:** Trang chủ phải hiển thị carousel/banner giới thiệu hệ thống.
- **[REQ-PT-002]:** Trang chủ phải hiển thị thanh tìm kiếm bác sĩ/chuyên khoa.
- **[REQ-PT-003]:** Trang chủ phải hiển thị danh sách bác sĩ nổi bật với hình ảnh và thông tin ngắn gọn.
- **[REQ-PT-004]:** Trang chủ phải hiển thị danh sách phòng khám với hình ảnh.
- **[REQ-PT-005]:** Trang chủ phải hiển thị danh sách chuyên khoa với hình ảnh.
- **[REQ-PT-006]:** Bệnh nhân phải có khả năng xem danh sách bác sĩ theo phòng khám hoặc chuyên khoa.

---

### 3.8 Patient – View Doctor Details

#### 3.8.1 Description

Bệnh nhân xem thông tin chi tiết của bác sĩ bao gồm hồ sơ chuyên môn, lịch khám khả dụng và giá khám. **Priority: High.**

#### 3.8.2 Stimulus/Response Sequences

| #   | User Action                            | System Response                                                    |
| --- | -------------------------------------- | ------------------------------------------------------------------ |
| 1   | Bệnh nhân nhấn vào bác sĩ từ danh sách | Hiển thị trang chi tiết bác sĩ                                     |
| 2   | Bệnh nhân chọn ngày khám               | Hiển thị các khung giờ khả dụng cho ngày đó và giá khám của bác sĩ |

#### 3.8.3 Functional Requirements

- **[REQ-PT-007]:** Hệ thống phải hiển thị hồ sơ chuyên môn của bác sĩ (tên, chuyên khoa, mô tả, hình ảnh).
- **[REQ-PT-008]:** Hệ thống phải hiển thị bài viết Markdown giới thiệu bác sĩ (render từ React-markdown).
- **[REQ-PT-009]:** Hệ thống phải hiển thị lịch khám khả dụng theo ngày.
- **[REQ-PT-010]:** Hệ thống phải hiển thị giá khám của bác sĩ (từ Doctor_Info.priceId, tra cứu qua Allcode).
- **[REQ-PT-011]:** Hệ thống phải hiển thị thông tin phòng khám mà bác sĩ thuộc về.

---

### 3.9 Patient – Appointment Booking

#### 3.9.1 Description

Bệnh nhân đặt lịch khám bệnh trực tuyến theo quy trình 4 bước. **Priority: High.**

#### 3.9.2 Stimulus/Response Sequences

| #   | User Action                                                                                      | System Response                             |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| 1   | Bệnh nhân chọn khung giờ khám                                                                    | Hiển thị modal đặt lịch                     |
| 2   | Bệnh nhân điền thông tin cá nhân (họ tên, email, SĐT, lý do khám, ngày sinh, giới tính, địa chỉ) | Hệ thống validate dữ liệu                   |
| 3   | Bệnh nhân nhấn "Xác nhận đặt lịch"                                                               | Hệ thống lưu lịch hẹn và gửi email xác thực |
| 4   | Bệnh nhân nhấn link xác nhận trong email                                                         | Hệ thống xác nhận lịch hẹn thành công       |

#### 3.9.3 Functional Requirements

- **[REQ-PT-012]:** Hệ thống phải hiển thị modal/form đặt lịch khi bệnh nhân chọn khung giờ.
- **[REQ-PT-013]:** Form đặt lịch phải bao gồm các trường: Họ tên, Email, Số điện thoại, Lý do khám, Ngày sinh, Giới tính, Địa chỉ.
- **[REQ-PT-014]:** Hệ thống phải validate dữ liệu đầu vào (email hợp lệ, SĐT hợp lệ, các trường bắt buộc không được trống).
- **[REQ-PT-015]:** Hệ thống phải lưu thông tin lịch hẹn vào database sau khi bệnh nhân xác nhận.
- **[REQ-PT-016]:** Hệ thống phải gửi email xác thực đến bệnh nhân sau khi đặt lịch, bao gồm link xác nhận và thông tin chi tiết lịch hẹn.
- **[REQ-PT-021]:** Hệ thống phải hiển thị thông báo lỗi rõ ràng khi validate form thất bại (ví dụ: "Email không hợp lệ", "Vui lòng nhập họ tên").
- **[REQ-PT-022]:** Hệ thống phải không cho phép đặt lịch trùng (cùng bác sĩ, cùng ngày, cùng khung giờ, cùng bệnh nhân).
- **[REQ-PT-023]:** Hệ thống phải hiển thị thông báo thành công sau khi đặt lịch và hướng dẫn bệnh nhân kiểm tra email.

---

### 3.10 Patient – Email Verification

#### 3.10.1 Description

Hệ thống gửi email xác thực cho bệnh nhân sau khi đặt lịch và xử lý xác nhận lịch hẹn qua link email. **Priority: High.**

#### 3.10.2 Stimulus/Response Sequences

| #   | User Action                             | System Response                                           |
| --- | --------------------------------------- | --------------------------------------------------------- |
| 1   | Bệnh nhân nhận email xác thực           | Email chứa thông tin lịch hẹn và link xác nhận            |
| 2   | Bệnh nhân nhấn link xác nhận            | Hệ thống cập nhật trạng thái lịch hẹn thành "Đã xác nhận" |
| 3   | Link xác nhận hết hạn hoặc không hợp lệ | Hệ thống hiển thị thông báo lỗi                           |

#### 3.10.3 Functional Requirements

- **[REQ-PT-017]:** Hệ thống phải gửi email xác thực qua Nodemailer (Gmail SMTP) ngay sau khi đặt lịch.
- **[REQ-PT-018]:** Email phải chứa thông tin: tên bác sĩ, chuyên khoa, ngày/giờ hẹn, thông tin bệnh nhân, link xác nhận.
- **[REQ-PT-019]:** Link xác nhận phải là duy nhất và có thể xác thực tính hợp lệ.
- **[REQ-PT-020]:** Hệ thống phải cập nhật trạng thái lịch hẹn khi bệnh nhân nhấn link xác nhận.

---

### 3.11 Doctor – Appointment Dashboard

#### 3.11.1 Description

Bác sĩ có dashboard quản lý lịch hẹn với khả năng lọc theo ngày, thời gian và trạng thái. **Priority: High.**

#### 3.11.2 Stimulus/Response Sequences

| #   | User Action                                     | System Response                              |
| --- | ----------------------------------------------- | -------------------------------------------- |
| 1   | Bác sĩ đăng nhập và truy cập dashboard          | Hiển thị danh sách bệnh nhân đặt lịch        |
| 2   | Bác sĩ chọn ngày cụ thể                         | Lọc và hiển thị lịch hẹn theo ngày được chọn |
| 3   | Bác sĩ nhấn "Hoàn thành" lịch hẹn (đã xác nhận) | Cập nhật trạng thái S2 → S3 ("Đã khám xong") |
| 4   | Bác sĩ nhấn "Hủy" lịch hẹn (đã xác nhận)        | Cập nhật trạng thái S2 → S4 ("Đã hủy")       |
| 5   | Bác sĩ nhấn "Gửi kết quả" (lịch hẹn S3)         | Mở form gửi email kết quả khám cho bệnh nhân |

#### 3.11.3 Functional Requirements

- **[REQ-DR-001]:** Hệ thống phải hiển thị danh sách bệnh nhân đặt lịch trên dashboard bác sĩ.
- **[REQ-DR-002]:** Bác sĩ phải có khả năng lọc lịch hẹn theo ngày.
- **[REQ-DR-003]:** Bác sĩ phải có khả năng lọc lịch hẹn theo trạng thái (mới, đã xác nhận, đã hoàn thành, đã hủy).
- **[REQ-DR-004]:** Bác sĩ phải có khả năng cập nhật trạng thái lịch hẹn: Hoàn thành (S2 → S3) hoặc Hủy (S2 → S4). Lưu ý: chuyển S1 → S2 do hệ thống tự động xử lý qua email.
- **[REQ-DR-011]:** Dashboard mặc định hiển thị lịch hẹn ngày hiện tại.

**Sơ đồ chuyển trạng thái lịch hẹn (Booking Status State Machine):**

```
                    Bệnh nhân đặt lịch
                          │
                          ▼
                   ┌─────────────┐
                   │  S1 – Mới   │
                   │ (New)       │
                   └──────┬──────┘
                          │
              Bệnh nhân click link email
                          │
                          ▼
                   ┌─────────────┐
          ┌────────│S2 – Đã xác  │────────┐
          │        │nhận          │        │
          │        │(Confirmed)  │        │
          │        └─────────────┘        │
          │                               │
    Bác sĩ nhấn                    Bác sĩ nhấn
    "Hoàn thành"                    "Hủy"
          │                               │
          ▼                               ▼
   ┌─────────────┐                ┌─────────────┐
   │S3 – Đã khám│                │  S4 – Đã   │
   │ xong (Done) │                │  hủy       │
   └─────────────┘                │(Cancelled) │
                                  └─────────────┘
```

**Quy tắc chuyển trạng thái:**

| Từ trạng thái     | Sang trạng thái   | Ai thực hiện | Điều kiện                                     |
| ----------------- | ----------------- | ------------ | --------------------------------------------- |
| — (chưa có)       | S1 (Mới)          | Hệ thống     | Khi bệnh nhân submit form đặt lịch            |
| S1 (Mới)          | S2 (Đã xác nhận)  | Hệ thống     | Khi bệnh nhân click link xác nhận trong email |
| S2 (Đã xác nhận)  | S3 (Đã khám xong) | Bác sĩ       | Nhấn nút "Hoàn thành" trên dashboard          |
| S2 (Đã xác nhận)  | S4 (Đã hủy)       | Bác sĩ       | Nhấn nút "Hủy" trên dashboard                 |
| S3 (Đã khám xong) | —                 | —            | Trạng thái cuối, không chuyển tiếp            |
| S4 (Đã hủy)       | —                 | —            | Trạng thái cuối, không chuyển tiếp            |

---

### 3.12 Doctor – Patient Detail View

#### 3.12.1 Description

Bác sĩ xem thông tin chi tiết của bệnh nhân đã đặt lịch. **Priority: Medium.**

#### 3.12.2 Stimulus/Response Sequences

| #   | User Action                                   | System Response                       |
| --- | --------------------------------------------- | ------------------------------------- |
| 1   | Bác sĩ nhấn vào tên bệnh nhân trong dashboard | Hiển thị thông tin chi tiết bệnh nhân |

#### 3.12.3 Functional Requirements

- **[REQ-DR-005]:** Hệ thống phải hiển thị thông tin cá nhân bệnh nhân: họ tên, email, SĐT, ngày sinh, giới tính, địa chỉ.
- **[REQ-DR-006]:** Hệ thống phải hiển thị lý do khám bệnh.
- **[REQ-DR-007]:** Hệ thống phải hiển thị lịch sử đặt lịch của bệnh nhân (nếu có).

---

### 3.13 Doctor – Send Medical Results via Email

#### 3.13.1 Description

Bác sĩ gửi hóa đơn, toa thuốc, kết quả xét nghiệm cho bệnh nhân qua email kèm file đính kèm. **Priority: High.**

#### 3.13.2 Stimulus/Response Sequences

| #   | User Action                                           | System Response                                         |
| --- | ----------------------------------------------------- | ------------------------------------------------------- |
| 1   | Bác sĩ nhấn "Gửi kết quả" trên lịch hẹn đã hoàn thành | Hiển thị form gửi email                                 |
| 2   | Bác sĩ nhập nội dung và đính kèm file (PDF/hình ảnh)  | Hệ thống chuẩn bị email                                 |
| 3   | Bác sĩ nhấn "Gửi"                                     | Hệ thống gửi email đến bệnh nhân và xác nhận thành công |

#### 3.13.3 Functional Requirements

- **[REQ-DR-008]:** Bác sĩ phải có khả năng gửi email kết quả khám cho bệnh nhân.
- **[REQ-DR-009]:** Hệ thống phải hỗ trợ đính kèm file (PDF, hình ảnh) trong email qua Nodemailer.
- **[REQ-DR-010]:** Email phải chứa thông tin: tên bác sĩ, ngày khám, nội dung kết quả, file đính kèm.

---

### 3.14 Social Integration (Facebook Plugin)

#### 3.14.1 Description

Tích hợp Facebook Social Plugin cho phép người dùng Like, Share, Comment trên trang thông tin bác sĩ/phòng khám. **Priority: Medium.**

#### 3.14.2 Stimulus/Response Sequences

| #   | User Action                            | System Response                       |
| --- | -------------------------------------- | ------------------------------------- |
| 1   | Người dùng xem trang bác sĩ/phòng khám | Hiển thị nút Like, Share Facebook     |
| 2   | Người dùng nhấn Like/Share             | Tương tác được ghi nhận trên Facebook |

#### 3.14.3 Functional Requirements

- **[REQ-SI-001]:** Hệ thống phải nhúng nút Like Facebook trên trang chi tiết bác sĩ.
- **[REQ-SI-002]:** Hệ thống phải nhúng nút Share Facebook trên trang chi tiết bác sĩ và phòng khám.
- **[REQ-SI-003]:** Hệ thống phải nhúng Comment Plugin Facebook (nếu áp dụng).

---

### 3.15 Chatbot Integration (Facebook Messenger)

#### 3.15.1 Description

Tích hợp Facebook Messenger Chat Plugin với Chatbot tự động trả lời các câu hỏi về đặt lịch, chuyên khoa, bệnh viện. **Priority: Medium.**

#### 3.15.2 Stimulus/Response Sequences

| #   | User Action                                            | System Response          |
| --- | ------------------------------------------------------ | ------------------------ |
| 1   | Người dùng nhấn biểu tượng chat Messenger trên website | Mở cửa sổ chat Messenger |
| 2   | Người dùng nhập câu hỏi                                | Chatbot tự động phản hồi |

#### 3.15.3 Functional Requirements

- **[REQ-CB-001]:** Hệ thống phải nhúng Facebook Messenger Chat Plugin trên website.
- **[REQ-CB-002]:** Chatbot phải tự động trả lời các câu hỏi phổ biến về: đặt lịch khám, chuyên khoa, thông tin bệnh viện.
- **[REQ-CB-003]:** Chatbot phải sử dụng Webhook để xử lý tin nhắn.

---

## 4. Data Requirements

### 4.1 Logical Data Model

Hệ thống sử dụng cơ sở dữ liệu quan hệ (MySQL/PostgreSQL) với các entity chính và mối quan hệ như sau:

```
┌──────────────┐       ┌────────────────┐     ┌──────────────┐
│    User      │       │  Doctor_Info    │     │  Specialty   │
│──────────────│       │────────────────│     │──────────────│
│ id (PK)      │──1:1─►│ id (PK)        │◄N:1│ id (PK)      │
│ email        │       │ doctorId (FK)  │     │ name         │
│ password     │       │ specialtyId(FK)│     │ image        │
│ firstName    │       │ clinicId (FK)  │     │ description  │
│ lastName     │       │ priceId        │     └──────────────┘
│ address      │       │ provinceId     │
│ phoneNumber  │       │ paymentId      │     ┌──────────────┐
│ gender       │       │ contentMarkdown│     │   Clinic     │
│ roleId       │       │ contentHTML    │     │──────────────│
│ image        │       │ description    │     │ id (PK)      │
│ positionId   │       └────────┬───────┘     │ name         │
└──────────────┘              │          N:1 │ address      │
                              └────────────►│ image        │
┌──────────────┐       ┌──────────────┐     │ description  │
│  Schedule    │       │  Booking     │     └──────────────┘
│──────────────│       │──────────────│
│ id (PK)      │       │ id (PK)      │     ┌──────────────┐
│ doctorId(FK) │◄──────│ doctorId(FK) │     │  Allcode     │
│ date         │       │ patientId(FK)│     │──────────────│
│ timeType     │       │ date         │     │ id (PK)      │
│ maxNumber    │       │ timeType     │     │ type         │
│ currentNumber│       │ statusId     │     │ keyMap       │
└──────────────┘       │ token        │     │ valueVi      │
                       │ reason       │     │ valueEn      │
                       │ patientName  │     └──────────────┘
                       └──────────────┘
```

**Mối quan hệ giữa các entity:**

| Quan hệ                   | Mô tả                                                                      |
| ------------------------- | -------------------------------------------------------------------------- |
| User ↔ Doctor_Info        | 1:1 – Mỗi User có role Doctor (R2) sẽ có một bản ghi Doctor_Info tương ứng |
| Doctor_Info ↔ Specialty   | N:1 – Nhiều bác sĩ thuộc một chuyên khoa                                   |
| Doctor_Info ↔ Clinic      | N:1 – Nhiều bác sĩ thuộc một phòng khám                                    |
| User (Doctor) ↔ Schedule  | 1:N – Một bác sĩ có nhiều lịch khám (FK: doctorId → User.id)               |
| User (Doctor) ↔ Booking   | 1:N – Một bác sĩ có nhiều lịch hẹn (FK: doctorId → User.id)                |
| User (Patient) ↔ Booking  | 1:N – Một bệnh nhân có nhiều lịch hẹn                                      |
| Allcode ↔ Multiple Tables | Bảng tra cứu chung cho: role, gender, time, status, position, price        |

### 4.2 Data Dictionary

#### Bảng User

| Tên trường  | Kiểu dữ liệu | Ràng buộc          | Mô tả                                       |
| ----------- | ------------ | ------------------ | ------------------------------------------- |
| id          | INTEGER      | PK, Auto Increment | Mã người dùng                               |
| email       | STRING(255)  | NOT NULL, UNIQUE   | Email đăng nhập                             |
| password    | STRING(255)  | NOT NULL           | Mật khẩu (đã mã hóa bcrypt)                 |
| firstName   | STRING(255)  | NOT NULL           | Tên                                         |
| lastName    | STRING(255)  | NOT NULL           | Họ                                          |
| address     | STRING(255)  | NULL               | Địa chỉ                                     |
| phoneNumber | STRING(20)   | NULL               | Số điện thoại                               |
| gender      | STRING(10)   | NULL               | Giới tính (keyMap từ Allcode)               |
| roleId      | STRING(10)   | NOT NULL           | Role: R1 (Admin), R2 (Doctor), R3 (Patient) |
| image       | BLOB         | NULL               | Ảnh đại diện (base64)                       |
| positionId  | STRING(10)   | NULL               | Chức danh (keyMap từ Allcode)               |

#### Bảng Doctor_Info (Thông tin chi tiết bác sĩ)

| Tên trường      | Kiểu dữ liệu | Ràng buộc          | Mô tả                        |
| --------------- | ------------ | ------------------ | ---------------------------- |
| id              | INTEGER      | PK, Auto Increment | Mã hồ sơ bác sĩ              |
| doctorId        | INTEGER      | FK → User.id       | Mã bác sĩ (liên kết User)    |
| specialtyId     | INTEGER      | FK → Specialty.id  | Mã chuyên khoa               |
| clinicId        | INTEGER      | FK → Clinic.id     | Mã phòng khám                |
| priceId         | STRING(10)   | NOT NULL           | Giá khám (keyMap từ Allcode) |
| provinceId      | STRING(10)   | NULL               | Tỉnh/thành phố               |
| paymentId       | STRING(10)   | NULL               | Phương thức thanh toán       |
| contentHTML     | TEXT         | NULL               | Nội dung HTML giới thiệu     |
| contentMarkdown | TEXT         | NULL               | Nội dung Markdown giới thiệu |
| description     | TEXT         | NULL               | Mô tả ngắn gọn               |
| note            | TEXT         | NULL               | Ghi chú thêm                 |
| count           | INTEGER      | DEFAULT 0          | Số lượt đặt khám             |

#### Bảng Schedule (Lịch khám bác sĩ)

| Tên trường    | Kiểu dữ liệu | Ràng buộc              | Mô tả                                |
| ------------- | ------------ | ---------------------- | ------------------------------------ |
| id            | INTEGER      | PK, Auto Increment     | Mã lịch khám                         |
| doctorId      | INTEGER      | FK → User.id, NOT NULL | Mã bác sĩ                            |
| date          | STRING(20)   | NOT NULL               | Ngày khám (timestamp)                |
| timeType      | STRING(10)   | NOT NULL               | Khung giờ (T1-T8, keyMap từ Allcode) |
| maxNumber     | INTEGER      | DEFAULT 10             | Số bệnh nhân tối đa                  |
| currentNumber | INTEGER      | DEFAULT 0              | Số bệnh nhân đã đặt                  |

#### Bảng Booking (Lịch hẹn)

| Tên trường         | Kiểu dữ liệu | Ràng buộc              | Mô tả                                                                |
| ------------------ | ------------ | ---------------------- | -------------------------------------------------------------------- |
| id                 | INTEGER      | PK, Auto Increment     | Mã lịch hẹn                                                          |
| statusId           | STRING(10)   | NOT NULL               | Trạng thái: S1 (Mới), S2 (Đã xác nhận), S3 (Hoàn thành), S4 (Đã hủy) |
| doctorId           | INTEGER      | FK → User.id, NOT NULL | Mã bác sĩ                                                            |
| patientId          | INTEGER      | FK → User.id, NOT NULL | Mã bệnh nhân                                                         |
| date               | STRING(20)   | NOT NULL               | Ngày hẹn                                                             |
| timeType           | STRING(10)   | NOT NULL               | Khung giờ                                                            |
| token              | STRING(255)  | NOT NULL               | Token xác thực email                                                 |
| reason             | TEXT         | NULL                   | Lý do khám                                                           |
| patientName        | STRING(255)  | NULL                   | Tên bệnh nhân                                                        |
| patientPhoneNumber | STRING(20)   | NULL                   | SĐT bệnh nhân                                                        |
| patientAddress     | STRING(255)  | NULL                   | Địa chỉ bệnh nhân                                                    |
| patientGender      | STRING(10)   | NULL                   | Giới tính bệnh nhân                                                  |
| patientBirthday    | STRING(20)   | NULL                   | Ngày sinh bệnh nhân                                                  |

#### Bảng Specialty (Chuyên khoa)

| Tên trường          | Kiểu dữ liệu | Ràng buộc          | Mô tả                |
| ------------------- | ------------ | ------------------ | -------------------- |
| id                  | INTEGER      | PK, Auto Increment | Mã chuyên khoa       |
| name                | STRING(255)  | NOT NULL           | Tên chuyên khoa      |
| image               | BLOB         | NULL               | Hình ảnh chuyên khoa |
| descriptionHTML     | TEXT         | NULL               | Mô tả HTML           |
| descriptionMarkdown | TEXT         | NULL               | Mô tả Markdown       |

#### Bảng Clinic (Phòng khám)

| Tên trường          | Kiểu dữ liệu | Ràng buộc          | Mô tả          |
| ------------------- | ------------ | ------------------ | -------------- |
| id                  | INTEGER      | PK, Auto Increment | Mã phòng khám  |
| name                | STRING(255)  | NOT NULL           | Tên phòng khám |
| address             | STRING(255)  | NOT NULL           | Địa chỉ        |
| image               | BLOB         | NULL               | Hình ảnh       |
| descriptionHTML     | TEXT         | NULL               | Mô tả HTML     |
| descriptionMarkdown | TEXT         | NULL               | Mô tả Markdown |

#### Bảng Allcode (Bảng tra cứu chung)

| Tên trường | Kiểu dữ liệu | Ràng buộc          | Mô tả                                                                |
| ---------- | ------------ | ------------------ | -------------------------------------------------------------------- |
| id         | INTEGER      | PK, Auto Increment | Mã                                                                   |
| type       | STRING(50)   | NOT NULL           | Loại: ROLE, GENDER, TIME, STATUS, POSITION, PRICE, PAYMENT, PROVINCE |
| keyMap     | STRING(10)   | NOT NULL, UNIQUE   | Mã key (ví dụ: R1, G1, T1, S1, PRI1)                                 |
| valueVi    | STRING(255)  | NOT NULL           | Giá trị tiếng Việt                                                   |
| valueEn    | STRING(255)  | NOT NULL           | Giá trị tiếng Anh                                                    |

**Dữ liệu mẫu bảng Allcode:**

| type     | keyMap | valueVi         | valueEn             |
| -------- | ------ | --------------- | ------------------- |
| ROLE     | R1     | Quản trị viên   | Admin               |
| ROLE     | R2     | Bác sĩ          | Doctor              |
| ROLE     | R3     | Bệnh nhân       | Patient             |
| GENDER   | G1     | Nam             | Male                |
| GENDER   | G2     | Nữ              | Female              |
| GENDER   | G3     | Khác            | Other               |
| TIME     | T1     | 8:00 – 9:00     | 8:00 AM – 9:00 AM   |
| TIME     | T2     | 9:00 – 10:00    | 9:00 AM – 10:00 AM  |
| TIME     | T3     | 10:00 – 11:00   | 10:00 AM – 11:00 AM |
| TIME     | T4     | 11:00 – 12:00   | 11:00 AM – 12:00 PM |
| TIME     | T5     | 13:00 – 14:00   | 1:00 PM – 2:00 PM   |
| TIME     | T6     | 14:00 – 15:00   | 2:00 PM – 3:00 PM   |
| TIME     | T7     | 15:00 – 16:00   | 3:00 PM – 4:00 PM   |
| TIME     | T8     | 16:00 – 17:00   | 4:00 PM – 5:00 PM   |
| STATUS   | S1     | Lịch hẹn mới    | New appointment     |
| STATUS   | S2     | Đã xác nhận     | Confirmed           |
| STATUS   | S3     | Đã khám xong    | Done                |
| STATUS   | S4     | Đã hủy          | Cancelled           |
| POSITION | P1     | Bác sĩ          | Doctor              |
| POSITION | P2     | Thạc sĩ         | Master              |
| POSITION | P3     | Tiến sĩ         | PhD                 |
| POSITION | P4     | Phó giáo sư     | Associate Professor |
| POSITION | P5     | Giáo sư         | Professor           |
| PRICE    | PRI1   | 100.000đ        | 100,000 VND         |
| PRICE    | PRI2   | 200.000đ        | 200,000 VND         |
| PRICE    | PRI3   | 300.000đ        | 300,000 VND         |
| PRICE    | PRI4   | 500.000đ        | 500,000 VND         |
| PAYMENT  | PAY1   | Tiền mặt        | Cash                |
| PAYMENT  | PAY2   | Chuyển khoản    | Bank transfer       |
| PROVINCE | PRO1   | Hà Nội          | Hanoi               |
| PROVINCE | PRO2   | TP. Hồ Chí Minh | Ho Chi Minh City    |
| PROVINCE | PRO3   | Đà Nẵng         | Da Nang             |

### 4.3 Reports

Hệ thống hiện tại không tạo báo cáo tự động. Tuy nhiên, trong các phiên bản tương lai, có thể bổ sung:

- **Báo cáo lịch hẹn theo ngày/tuần/tháng** cho bác sĩ.
- **Dashboard thống kê** cho Admin: số lượng bệnh nhân, tỷ lệ đặt lịch, bác sĩ phổ biến.

### 4.4 Data Acquisition, Integrity, Retention, and Disposal

- **Data Acquisition:** Dữ liệu được nhập liệu bởi Admin (bác sĩ, phòng khám, chuyên khoa) và bệnh nhân (thông tin đặt lịch). Hình ảnh được upload và chuyển đổi sang base64 trước khi lưu BLOB.
- **Data Integrity:** Sequelize ORM đảm bảo ràng buộc khóa ngoại (Foreign Key), validation trường dữ liệu bắt buộc, và transaction cho các thao tác CRUD phức tạp.
- **Data Retention:** Tất cả dữ liệu lịch hẹn được lưu trữ vĩnh viễn cho mục đích lịch sử. Dữ liệu không tự động xóa.
- **Data Backup:** Trên production (Heroku Postgres), database được backup tự động bởi Heroku. Trên development, backup thủ công qua MySQL dump.

---

## 5. External Interface Requirements

### 5.1 User Interfaces

Hệ thống cung cấp giao diện web responsive với các trang chính:

| #   | Trang / Giao diện                           | Mô tả                                                                                 | Đối tượng     |
| --- | ------------------------------------------- | ------------------------------------------------------------------------------------- | ------------- |
| 1   | **Trang chủ (Homepage)**                    | Carousel, thanh tìm kiếm, bác sĩ nổi bật, phòng khám, chuyên khoa                     | Tất cả        |
| 2   | **Trang chi tiết bác sĩ**                   | Hồ sơ, lịch khám theo ngày/giờ, giá khám, nút Like/Share                              | Bệnh nhân     |
| 3   | **Trang danh sách bác sĩ theo chuyên khoa** | Danh sách bác sĩ thuộc chuyên khoa được chọn                                          | Bệnh nhân     |
| 4   | **Trang danh sách bác sĩ theo phòng khám**  | Danh sách bác sĩ thuộc phòng khám được chọn                                           | Bệnh nhân     |
| 5   | **Modal đặt lịch khám**                     | Form điền thông tin đặt lịch (overlay trên trang bác sĩ)                              | Bệnh nhân     |
| 6   | **Trang xác nhận email**                    | Hiển thị kết quả xác nhận lịch hẹn từ link email                                      | Bệnh nhân     |
| 7   | **Trang đăng nhập**                         | Form đăng nhập email/mật khẩu                                                         | Admin, Bác sĩ |
| 8   | **Dashboard Admin**                         | Sidebar menu + nội dung CRUD (người dùng, bác sĩ, phòng khám, chuyên khoa, lịch khám) | Admin         |
| 9   | **Dashboard Bác sĩ**                        | Quản lý lịch hẹn, xem bệnh nhân, gửi email kết quả                                    | Bác sĩ        |

**Tiêu chuẩn UI:**

- Responsive design: Desktop (≥1024px) và Mobile (≤768px).
- Sử dụng Bootstrap cho grid layout.
- Đa ngôn ngữ Anh-Việt trên toàn bộ giao diện.
- Font chữ, màu sắc nhất quán trên toàn hệ thống.

### 5.2 Software Interfaces

| #   | Phần mềm / Dịch vụ                         | Giao tiếp                           | Mô tả                                           |
| --- | ------------------------------------------ | ----------------------------------- | ----------------------------------------------- |
| 1   | **MySQL / PostgreSQL**                     | Sequelize ORM (TCP, cổng 3306/5432) | Lưu trữ dữ liệu hệ thống                        |
| 2   | **Gmail SMTP**                             | Nodemailer (SMTP, cổng 587)         | Gửi email xác thực lịch hẹn, hóa đơn, toa thuốc |
| 3   | **Facebook SDK**                           | JavaScript SDK (HTTPS)              | Nhúng nút Like, Share, Comment trên website     |
| 4   | **Facebook Messenger Platform**            | Webhook (HTTPS POST)                | Chatbot tự động trả lời tin nhắn                |
| 5   | **React.js Frontend ↔ Express.js Backend** | RESTful API (HTTP/HTTPS, JSON)      | Giao tiếp client-server                         |

**Định dạng dữ liệu trao đổi:** JSON (Content-Type: application/json)

**Danh sách API endpoints:**

| Method | Endpoint                                           | Request Body / Params                                                                                                | Response                                                             | Auth   |
| ------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------ |
| POST   | /api/login                                         | `{email, password}`                                                                                                  | `{errCode, message, user: {id, email, roleId, firstName, lastName}}` | Không  |
| GET    | /api/get-all-users?id=ALL                          | Query: `id` (ALL hoặc userId)                                                                                        | `{errCode, users: [...]}`                                            | Admin  |
| POST   | /api/create-new-user                               | `{email, password, firstName, lastName, address, phoneNumber, gender, roleId, image}`                                | `{errCode, message}`                                                 | Admin  |
| PUT    | /api/edit-user                                     | `{id, firstName, lastName, address, phoneNumber, gender, roleId, image}`                                             | `{errCode, message}`                                                 | Admin  |
| DELETE | /api/delete-user                                   | Body: `{id}`                                                                                                         | `{errCode, message}`                                                 | Admin  |
| GET    | /api/get-top-doctor-home?limit=10                  | Query: `limit`                                                                                                       | `{errCode, data: [doctor...]}`                                       | Không  |
| GET    | /api/get-detail-doctor-by-id?id=X                  | Query: `id`                                                                                                          | `{errCode, data: {doctorInfo, markdown, specialty, clinic...}}`      | Không  |
| POST   | /api/save-info-doctor                              | `{doctorId, contentHTML, contentMarkdown, description, specialtyId, clinicId, priceId, provinceId, paymentId, note}` | `{errCode, message}`                                                 | Admin  |
| POST   | /api/bulk-create-schedule                          | `{arrSchedule: [{doctorId, date, timeType}...]}`                                                                     | `{errCode, message}`                                                 | Admin  |
| GET    | /api/get-schedule-by-date?doctorId=X&date=Y        | Query: `doctorId`, `date` (timestamp)                                                                                | `{errCode, data: [schedule...]}`                                     | Không  |
| POST   | /api/patient-book-appointment                      | `{fullName, phoneNumber, email, address, reason, date, birthday, doctorId, timeType, gender, language}`              | `{errCode, message}`                                                 | Không  |
| POST   | /api/verify-book-appointment                       | Body: `{token, doctorId}`                                                                                            | `{errCode, message}`                                                 | Không  |
| GET    | /api/get-list-patient-for-doctor?doctorId=X&date=Y | Query: `doctorId`, `date`                                                                                            | `{errCode, data: [patient...]}`                                      | Doctor |
| POST   | /api/send-remedy                                   | `{email, doctorId, patientId, timeType, imageBase64 (file đính kèm), language}`                                      | `{errCode, message}`                                                 | Doctor |
| POST   | /api/create-new-specialty                          | `{name, imageBase64, descriptionHTML, descriptionMarkdown}`                                                          | `{errCode, message}`                                                 | Admin  |
| GET    | /api/get-all-specialty                             | —                                                                                                                    | `{errCode, data: [specialty...]}`                                    | Không  |
| GET    | /api/get-detail-specialty-by-id?id=X&location=ALL  | Query: `id`, `location`                                                                                              | `{errCode, data: {specialty, doctorList}}`                           | Không  |
| POST   | /api/create-new-clinic                             | `{name, address, imageBase64, descriptionHTML, descriptionMarkdown}`                                                 | `{errCode, message}`                                                 | Admin  |
| GET    | /api/get-all-clinic                                | —                                                                                                                    | `{errCode, data: [clinic...]}`                                       | Không  |
| GET    | /api/get-detail-clinic-by-id?id=X                  | Query: `id`                                                                                                          | `{errCode, data: {clinic, doctorList}}`                              | Không  |
| GET    | /api/allcode?type=X                                | Query: `type` (ROLE, GENDER, TIME, STATUS, POSITION, PRICE, PAYMENT, PROVINCE)                                       | `{errCode, data: [allcode...]}`                                      | Không  |

**Quy ước API Response:**

- `errCode = 0`: Thành công
- `errCode = 1`: Thiếu tham số bắt buộc
- `errCode = 2`: Dữ liệu đã tồn tại (ví dụ: email trùng)
- `errCode = 3`: Không tìm thấy dữ liệu

### 5.3 Hardware Interfaces

Hệ thống là ứng dụng web, không tương tác trực tiếp với phần cứng đặc biệt. Yêu cầu phần cứng tối thiểu:

- **Client:** Thiết bị có trình duyệt web (PC, laptop, tablet, smartphone).
- **Server (Development):** Máy tính cá nhân với RAM ≥ 4GB, CPU dual-core, cài đặt Node.js và MySQL (XAMPP).
- **Server (Production):** Heroku Dyno (512MB RAM) cho backend, Heroku Postgres (10K rows free tier).

### 5.4 Communications Interfaces

- **HTTP/HTTPS:** Giao thức chính cho giao tiếp client-server (RESTful API). Production sử dụng HTTPS (SSL/TLS tự động bởi Vercel và Heroku).
- **SMTP (Gmail):** Giao thức gửi email, sử dụng cổng 587 với TLS. Xác thực bằng Gmail App Password.
- **CORS Policy:** Backend cấu hình CORS cho phép frontend domain truy cập API. Development: `http://localhost:3000`. Production: `https://<app-name>.vercel.app`.
- **Webhook (Facebook Messenger):** HTTPS POST requests từ Facebook Platform đến backend endpoint để xử lý tin nhắn chatbot.

---

## 6. Quality Attributes

### 6.1 Usability

- **[QA-US-001]:** Giao diện phải trực quan, người dùng mới có thể đặt lịch khám trong vòng 3 phút mà không cần hướng dẫn.
- **[QA-US-002]:** Quy trình đặt lịch phải đơn giản với tối đa 4 bước.
- **[QA-US-003]:** Thông báo lỗi phải rõ ràng, cụ thể và hữu ích (tiếng Việt và tiếng Anh).
- **[QA-US-004]:** Hệ thống phải responsive, hiển thị tốt trên cả desktop (≥1024px) và mobile (≤768px).
- **[QA-US-005]:** Giao diện đa ngôn ngữ phải chuyển đổi mượt mà, không cần tải lại trang.

### 6.2 Performance

- **[QA-PF-001]:** Trang chủ phải tải hoàn chỉnh trong vòng 3 giây trên kết nối Internet ổn định.
- **[QA-PF-002]:** API response time cho các truy vấn CRUD phải dưới 2 giây.
- **[QA-PF-003]:** Email xác thực phải được gửi trong vòng 30 giây sau khi bệnh nhân đặt lịch.
- **[QA-PF-004]:** Hệ thống phải hỗ trợ tối thiểu 50 người dùng đồng thời.
- **[QA-PF-005]:** Hình ảnh BLOB phải được tối ưu kích thước trước khi lưu vào database.

### 6.3 Security

- **[QA-SC-001]:** Mật khẩu phải được mã hóa bằng bcryptjs (salt rounds ≥ 10) trước khi lưu database.
- **[QA-SC-002]:** API endpoints nhạy cảm (Admin, Doctor) phải được bảo vệ bằng authentication middleware.
- **[QA-SC-003]:** Token xác thực email phải là chuỗi ngẫu nhiên duy nhất, không thể đoán.
- **[QA-SC-004]:** CORS policy phải chỉ cho phép frontend domain được cấu hình truy cập API.
- **[QA-SC-005]:** Thông tin nhạy cảm (database credentials, email password, API keys) phải được lưu trong environment variables (.env), không được commit lên GitHub.
- **[QA-SC-006]:** Hệ thống phải áp dụng rate limiting cơ bản để chống spam request.

### 6.4 Safety

- **[QA-SF-001]:** Hệ thống phải yêu cầu xác nhận trước khi thực hiện thao tác xóa (người dùng, bác sĩ, phòng khám, chuyên khoa).
- **[QA-SF-002]:** Dữ liệu bệnh nhân phải được bảo vệ, chỉ bác sĩ được phân công và Admin mới có quyền truy cập.
- **[QA-SF-003]:** Hệ thống phải ghi log các thao tác quan trọng (đăng nhập, tạo/xóa dữ liệu) cho mục đích audit trail.

### 6.5 Availability and Reliability

- **[QA-AV-001]:** Hệ thống production phải đạt uptime tối thiểu 95% (phụ thuộc vào Heroku và Vercel SLA).
- **[QA-AV-002]:** Database phải được backup tự động hàng ngày (Heroku Postgres).
- **[QA-RL-001]:** Hệ thống phải xử lý gracefully các lỗi kết nối database, email service, Facebook API, và hiển thị thông báo phù hợp cho người dùng.

---

## 7. Internationalization and Localization Requirements

- **[IL-001]:** Hệ thống phải hỗ trợ 2 ngôn ngữ: **Tiếng Việt (vi)** và **Tiếng Anh (en)**.
- **[IL-002]:** Người dùng phải có khả năng chuyển đổi ngôn ngữ từ bất kỳ trang nào mà không cần tải lại trang.
- **[IL-003]:** Tất cả text tĩnh (label, button, thông báo, menu) phải được dịch sang cả 2 ngôn ngữ.
- **[IL-004]:** Dữ liệu động (tên chuyên khoa, khung giờ, giá khám, trạng thái) phải hỗ trợ hiển thị song ngữ thông qua bảng Allcode (valueVi, valueEn).
- **[IL-005]:** Quốc tế hóa được triển khai bằng thư viện **react-intl** hoặc **i18next** kết hợp **Redux** để lưu trạng thái ngôn ngữ.
- **[IL-006]:** Ngôn ngữ mặc định là **Tiếng Việt**.
- **[IL-007]:** Lựa chọn ngôn ngữ của người dùng phải được lưu lại (redux-persist / localStorage) để duy trì khi truy cập lại.

---

## 8. Other Requirements

### 8.1 Deployment Requirements

- **[OT-001]:** Frontend React phải được build thành static files và deploy lên **Vercel**.
- **[OT-002]:** Backend Node.js phải được deploy lên **Heroku** với Procfile configuration.
- **[OT-003]:** Database phải được migrate từ **MySQL** sang **PostgreSQL** cho production sử dụng Sequelize CLI.
- **[OT-004]:** Environment variables phải được cấu hình trên Heroku (DB_HOST, DB_USERNAME, DB_PASSWORD, EMAIL_APP_PASSWORD, v.v.).

### 8.2 Version Control Requirements

- **[OT-005]:** Source code phải được quản lý trên **GitHub** repository.
- **[OT-006]:** Sử dụng Git branching strategy (main, develop, feature branches).
- **[OT-007]:** File `.env` phải được thêm vào `.gitignore` để bảo mật thông tin nhạy cảm.

### 8.3 Testing Requirements

- **[OT-008]:** Tất cả API endpoints phải được kiểm thử bằng **Postman**.
- **[OT-009]:** Giao diện phải được kiểm thử trên Chrome, Firefox, Edge và Safari.
- **[OT-010]:** Hệ thống phải trải qua kiểm thử user acceptance testing trước khi demo.

### 8.4 Hướng phát triển đề tài (Future Development)

Các tính năng dưới đây **không thuộc phạm vi phiên bản 1.0** nhưng được xác định là hướng phát triển mở rộng trong tương lai:

| #   | Tính năng mở rộng               | Mô tả                                                                                                           |
| --- | ------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | **Ứng dụng Mobile**             | Xây dựng ứng dụng di động với React Native hoặc Flutter để bệnh nhân đặt lịch khám tiện lợi hơn trên điện thoại |
| 2   | **Thanh toán trực tuyến**       | Kết nối cổng thanh toán (VNPay, MoMo, ZaloPay) để bệnh nhân thanh toán phí khám bệnh trước khi đến phòng khám   |
| 3   | **AI hỗ trợ chẩn đoán sơ bộ**   | Tích hợp chatbot AI (GPT API) hỗ trợ bệnh nhân mô tả triệu chứng và gợi ý chuyên khoa/bác sĩ phù hợp            |
| 4   | **Thông báo realtime**          | Sử dụng Socket.IO hoặc Firebase Cloud Messaging để thông báo realtime cho bác sĩ khi có bệnh nhân đặt lịch mới  |
| 5   | **Đánh giá bác sĩ**             | Cho phép bệnh nhân đánh giá chất lượng khám bệnh, xây dựng hệ thống rating/review cho bác sĩ                    |
| 6   | **Video Call (Telemedicine)**   | Cho phép khám bệnh từ xa qua video call giữa bác sĩ và bệnh nhân                                                |
| 7   | **Dashboard phân tích dữ liệu** | Dashboard thống kê cho Admin: số lượng bệnh nhân, tỷ lệ đặt lịch thành công, doanh thu (Chart.js/D3.js)         |
| 8   | **Mở rộng Cloud**               | Migrate từ Heroku sang AWS/GCP với Docker container, CI/CD pipeline tự động                                     |

---

## 9. Glossary

| Thuật ngữ                                       | Viết tắt | Định nghĩa                                        |
| ----------------------------------------------- | -------- | ------------------------------------------------- |
| Software Requirements Specification             | SRS      | Tài liệu đặc tả yêu cầu phần mềm                  |
| Create, Read, Update, Delete                    | CRUD     | 4 thao tác cơ bản trên dữ liệu                    |
| Application Programming Interface               | API      | Giao diện lập trình ứng dụng                      |
| Representational State Transfer                 | REST     | Kiến trúc thiết kế API web                        |
| Object-Relational Mapping                       | ORM      | Ánh xạ đối tượng - quan hệ, ở đây là Sequelize    |
| Single Page Application                         | SPA      | Ứng dụng web tải một trang duy nhất               |
| JSON Web Token                                  | JWT      | Chuẩn token cho xác thực người dùng               |
| Simple Mail Transfer Protocol                   | SMTP     | Giao thức gửi email                               |
| Binary Large Object                             | BLOB     | Kiểu dữ liệu lưu trữ dữ liệu nhị phân (hình ảnh)  |
| Cross-Origin Resource Sharing                   | CORS     | Cơ chế cho phép truy cập tài nguyên cross-domain  |
| Content Delivery Network                        | CDN      | Mạng phân phối nội dung                           |
| Continuous Integration/Continuous Deployment    | CI/CD    | Quy trình tích hợp và triển khai liên tục         |
| Entity-Relationship Diagram                     | ERD      | Sơ đồ thực thể - quan hệ                          |
| Hypertext Transfer Protocol Secure              | HTTPS    | Giao thức HTTP bảo mật với SSL/TLS                |
| Secure Sockets Layer / Transport Layer Security | SSL/TLS  | Giao thức bảo mật truyền dữ liệu                  |
| User Interface / User Experience                | UI/UX    | Giao diện / Trải nghiệm người dùng                |
| Software Development Life Cycle                 | SDLC     | Vòng đời phát triển phần mềm                      |
| Webhook                                         | —        | Cơ chế callback HTTP tự động khi có sự kiện       |
| Markdown                                        | MD       | Ngôn ngữ đánh dấu nhẹ để tạo văn bản có định dạng |

---

## 10. Analysis Models

### 10.1 Use Case Diagram – Tổng quan

Sơ đồ tổng quan thể hiện mối quan hệ giữa 3 actors (Admin, Bệnh nhân, Bác sĩ) và 17 use cases của hệ thống, cùng 2 shared use cases (Đăng nhập, Gửi email). Các mối quan hệ `<<include>>` biểu thị: tất cả use cases của Admin và Bác sĩ đều yêu cầu Đăng nhập; Đặt lịch khám và Gửi kết quả khám đều bao gồm Gửi email.

<!-- TODO: Thay bằng hình PNG đã render từ PlantUML -->

![Use Case Diagram - Tổng quan](images/usecase_overview.png)

---

### 10.2 Use Case Diagram – Module Admin

Module Admin bao gồm 6 use cases chính quản lý toàn bộ hệ thống. Tất cả đều yêu cầu đăng nhập (`<<include>>` Đăng nhập).

| Use Case                                     | Mô tả                             | SRS Section |
| -------------------------------------------- | --------------------------------- | ----------- |
| Quản lý người dùng (CRUD)                    | Tạo, xem, sửa, xóa tài khoản      | 3.2         |
| Quản lý bác sĩ (CRUD + Markdown)             | Hồ sơ bác sĩ, bài viết giới thiệu | 3.3         |
| Quản lý phòng khám (CRUD)                    | Thông tin phòng khám / cơ sở y tế | 3.4         |
| Quản lý chuyên khoa (CRUD)                   | Các chuyên khoa khám bệnh         | 3.5         |
| Quản lý lịch khám bác sĩ (Bulk create T1-T8) | Tạo hàng loạt khung giờ khám      | 3.6         |
| Phân quyền role (R1, R2, R3)                 | Gán role Admin, Doctor, Patient   | 3.1         |

<!-- TODO: Thay bằng hình PNG đã render từ PlantUML -->

![Use Case Diagram - Module Admin](images/usecase_admin.png)

---

### 10.3 Use Case Diagram – Module Bệnh nhân

Module Bệnh nhân bao gồm 7 use cases trên giao diện công khai. Bệnh nhân **không cần đăng nhập** để sử dụng hệ thống. Use case "Đặt lịch khám bệnh" `<<include>>` "Gửi email" (hệ thống tự động gửi email xác thực sau khi đặt lịch).

| Use Case                      | Mô tả                                   | SRS Section |
| ----------------------------- | --------------------------------------- | ----------- |
| Xem trang chủ                 | Homepage với carousel, search bar       | 3.7         |
| Tìm kiếm bác sĩ / chuyên khoa | Tìm theo từ khóa                        | 3.7         |
| Xem chi tiết bác sĩ           | Hồ sơ, lịch khám, giá khám              | 3.8         |
| Đặt lịch khám bệnh (4 bước)   | Chọn giờ → Điền form → Xác nhận → Email | 3.9         |
| Xác thực email lịch hẹn       | Click link xác nhận trong email         | 3.10        |
| Like / Share Facebook         | Tương tác Social Plugin                 | 3.14        |
| Chat với Chatbot Messenger    | Hỏi đáp tự động                         | 3.15        |

<!-- TODO: Thay bằng hình PNG đã render từ PlantUML -->

![Use Case Diagram - Module Bệnh nhân](images/usecase_patient.png)

---

### 10.4 Use Case Diagram – Module Bác sĩ

Module Bác sĩ bao gồm 4 use cases quản lý lịch hẹn và bệnh nhân. Tất cả đều yêu cầu đăng nhập (`<<include>>` Đăng nhập). Use case "Gửi kết quả khám" `<<include>>` "Gửi email" (gửi kết quả kèm file đính kèm qua Nodemailer).

| Use Case                                       | Mô tả                                       | SRS Section |
| ---------------------------------------------- | ------------------------------------------- | ----------- |
| Xem dashboard lịch hẹn                         | Danh sách bệnh nhân đặt lịch, lọc theo ngày | 3.11        |
| Xem chi tiết bệnh nhân                         | Thông tin cá nhân, lý do khám               | 3.12        |
| Cập nhật trạng thái lịch hẹn (S2→S3 / S2→S4)   | Hoàn thành hoặc Hủy lịch hẹn                | 3.11        |
| Gửi kết quả khám qua email (kèm file đính kèm) | Hóa đơn, toa thuốc, xét nghiệm              | 3.13        |

<!-- TODO: Thay bằng hình PNG đã render từ PlantUML -->

![Use Case Diagram - Module Bác sĩ](images/usecase_doctor.png)

---

### 10.5 Sequence Diagram – Quy trình đặt lịch khám

```
  Bệnh nhân          Frontend           Backend           Database         Gmail SMTP
      │                  │                  │                  │                │
      │  1. Chọn bác sĩ  │                  │                  │                │
      │─────────────────►│                  │                  │                │
      │                  │ 2. GET /detail   │                  │                │
      │                  │─────────────────►│ 3. SELECT Doctor │                │
      │                  │                  │─────────────────►│                │
      │                  │                  │ 4. Return data   │                │
      │                  │ 5. Hiển thị      │◄─────────────────│                │
      │  6. Chọn ngày/giờ│◄─────────────────│                  │                │
      │─────────────────►│                  │                  │                │
      │                  │ 7. GET /schedule │                  │                │
      │                  │─────────────────►│ 8. SELECT Sched  │                │
      │                  │                  │─────────────────►│                │
      │                  │ 9. Hiển thị slot │◄─────────────────│                │
      │ 10. Điền form    │◄─────────────────│                  │                │
      │─────────────────►│                  │                  │                │
      │                  │ 11. POST /book   │                  │                │
      │                  │─────────────────►│ 12. INSERT Book  │                │
      │                  │                  │─────────────────►│                │
      │                  │                  │ 13. Send email   │                │
      │                  │                  │────────────────────────────────►  │
      │                  │ 14. Thông báo    │                  │                │
      │ 15. Nhận email   │◄─────────────────│                  │                │
      │◄──────────────────────────────────────────────────────────────────────  │
      │ 16. Click link   │                  │                  │                │
      │─────────────────►│ 17. POST/verify  │                  │                │
      │                  │─────────────────►│ 18. UPDATE status│                │
      │                  │                  │─────────────────►│                │
      │                  │ 19. Xác nhận OK  │                  │                │
      │◄─────────────────│◄─────────────────│                  │                │
      │                  │                  │                  │                │
```

---

_Hết tài liệu SRS – Phiên bản 1.2_
