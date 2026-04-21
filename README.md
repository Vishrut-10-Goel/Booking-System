# 🎟️ EVENTRA – Event Booking Platform v4

EVENTRA is a robust, full-stack event booking platform designed for seamless event management and ticket purchasing. Built with a modern monolithic architecture, it combines a high-performance Node.js backend with a sleek, interactive frontend.

---

## 🚀 Quick Start

Follow these steps to get the project running locally:

### 1. Database Setup
Ensure you have MySQL installed and running.
```bash
mysql -u root -p < database/schema.sql
```

### 2. Backend Configuration
Navigate to the backend directory, install dependencies, and configure your environment.
```bash
cd backend
# Create .env from .env.example and set your DB credentials
npm install
npm start
```

### 3. Frontend Access
Since the frontend is built with vanilla HTML/CSS/JS, you can simply open it in your browser.
```bash
# Simply open the file in your preferred browser
open frontend/index.html
```

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js
- **Database**: MySQL (Triggers, Stored Procedures, Views)
- **Authentication**: JWT (JSON Web Tokens)
- **Frontend**: HTML5, Vanilla CSS, JavaScript (ES6+)
- **State Management**: LocalStorage & Backend Sessions

---

## 🔐 Login Credentials

### Admin Dashboard
Access the administrative panel with these credentials:
| Email | Password | Role |
|---|---|---|
| `goelvishrut7@gmail.com` | `asdfghjkl` | Super Admin |

### Demo Users
| Name | Email | Password |
|---|---|---|
| Arjun Ramesh | `arjun.r@gmail.com` | `Admin@123` |
| Priya Suresh | `priya.s@gmail.com` | `User@123` |
| Karthik Vijay | `karthik.v@gmail.com` | `User@123` |

> [!TIP]
> **New User?** Registration is fully functional. Just click "Get Started" on the homepage!

---

## ⚙️ Environment Configuration

Create a `.env` file in the `backend/` directory with the following variables:

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=EVENTRA
PORT=5000
JWT_SECRET=eventra_super_secret_jwt_key
JWT_EXPIRES_IN=7d
FRONTEND_URL=*
```

---

## 🔄 User Workflow

1.  **Discovery**: Browse events on the homepage with category filters.
2.  **Detail**: View event specifics, descriptions, and ratings.
3.  **Booking**: Interactive 4-step booking process:
    - 💺 **Seats**: Real-time seat selection with availability map.
    - 🍕 **Food**: Optional meal selection for your event.
    - 📋 **Summary**: Review your selection before payment.
    - 💳 **Payment**: Secure checkout simulation.
4.  **Dashboard**: Manage tickets, cancel bookings, and leave reviews.

### 🎭 Seat Selection Logic
- **Green**: Available | **Red**: Booked | **Blue**: Your Selection
- **VIP** (Row A), **Premium** (Row B), **Regular** (Rows C-E)
- **5-Minute Hold**: Seats are locked for 5 minutes once you start selecting.

---

## 📊 Admin Features

- **Analytics**: View real-time revenue and booking stats.
- **Event Management**: CRUD operations for events.
- **Automated Seating**: Stored procedures for generating seat maps.
- **User Insights**: Manage and view all registered users and their bookings.

---

## 🔌 API Reference

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Register new user |
| `POST` | `/api/auth/login` | No | Authenticte & get JWT |
| `GET` | `/api/events` | No | Fetch all events |
| `POST` | `/api/bookings` | JWT | Create a new booking |
| `GET` | `/api/admin/analytics` | Admin | Real-time stats |

---

## 🗄️ Database Architecture

Efficiently designed with **11 tables**, featuring:
- **Triggers**: Automatic seat status updates and rating recalculations.
- **Stored Procedures**: Complex logic handled at the DB level for performance.
- **Atomic Transactions**: Ensuring row-level locking during booking.

---

## 👨‍💻 Author

**Vishrut Goel**
📧 [goelvishrut7@gmail.com](mailto:goelvishrut7@gmail.com)
*EVENTRA v4 · DBMS Project*
