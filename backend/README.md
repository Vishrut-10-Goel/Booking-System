# EVENTRA Backend API v3.0

Full-stack Node.js + Express REST API for the EVENTRA Event Booking & Management System.
Backed by MySQL with stored procedures, triggers, ACID transactions, email notifications, PDF tickets, and QR codes.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# → Edit .env: set DB_PASSWORD, JWT_SECRET, and EMAIL credentials

# 3. Set up the database
mysql -u root -p < EVENTRA_FINAL_COMPLETE.sql

# 4. Start the server
npm run dev        # development (nodemon, auto-reload)
npm start          # production
```

Server: `http://localhost:5000`

---

## 📁 Project Structure

```
eventra-backend/
├── app.js                         Entry point – Express + all routes
├── .env.example                   Environment template
├── config/
│   ├── db.js                      MySQL connection pool
│   └── email.js                   Nodemailer transporter (Gmail SMTP)
├── controllers/
│   ├── authController.js          Register, Login, GetMe
│   ├── eventController.js         Event CRUD, categories, venues
│   ├── seatController.js          Seat map, generate seats
│   ├── bookingController.js       Create/cancel bookings (transactional)
│   ├── reviewController.js        Submit/update/delete reviews
│   ├── ticketController.js        PDF download, QR code
│   ├── paymentController.js       Payment verify, status
│   ├── foodController.js          Food menu
│   └── adminController.js         Analytics, reports, bulk email
├── middleware/
│   ├── auth.js                    JWT protect + adminOnly
│   ├── security.js                Helmet + rate limiting
│   └── errorHandler.js            Global error handler
├── routes/
│   ├── authRoutes.js
│   ├── eventRoutes.js
│   ├── bookingRoutes.js
│   ├── reviewRoutes.js
│   ├── ticketRoutes.js
│   ├── paymentRoutes.js
│   ├── foodRoutes.js
│   └── adminRoutes.js
├── services/
│   ├── emailService.js            All email templates (welcome, booking, reminder, etc.)
│   └── ticketService.js           PDF ticket + QR code generation
├── jobs/
│   └── emailScheduler.js          Cron: 24h reminders + post-event review requests
└── utils/
    └── helpers.js                 Constants, pagination, formatters
```

---

## 🔐 Authentication

All protected routes require:
```
Authorization: Bearer <jwt_token>
```
Tokens are returned from `/api/auth/register` and `/api/auth/login`.

---

## 📡 Complete API Reference (40+ Endpoints)

### Health
| Method | Endpoint     | Auth | Description   |
|--------|-------------|------|---------------|
| GET    | /api/health | None | Server status |

---

### Auth — `/api/auth`
| Method | Endpoint            | Auth      | Description              |
|--------|---------------------|-----------|--------------------------|
| POST   | /register           | None      | Register + welcome email |
| POST   | /login              | None      | Login, get JWT           |
| GET    | /me                 | Protected | Current user profile     |

```json
POST /api/auth/register
{ "full_name": "Arjun", "email": "arjun@test.com", "password": "pass123" }

POST /api/auth/login
{ "email": "arjun@test.com", "password": "pass123" }
```

---

### Events — `/api/events`
| Method | Endpoint                            | Auth  | Description                     |
|--------|-------------------------------------|-------|---------------------------------|
| GET    | /                                   | None  | List events (filterable)        |
| GET    | /:id                                | None  | Event detail + seat summary     |
| POST   | /                                   | Admin | Create event                    |
| PUT    | /:id                                | Admin | Update event                    |
| GET    | /categories                         | None  | All categories                  |
| GET    | /venues                             | None  | All venues                      |
| GET    | /:eventId/seats                     | None  | Seat map (grouped by row)       |
| POST   | /:eventId/seats/generate            | Admin | Generate seat layout            |
| GET    | /:eventId/reviews                   | None  | Reviews for event               |
| GET    | /:eventId/reviews/distribution      | None  | Star rating breakdown           |

**Query params for GET /api/events:**
```
?category_id=1  ?city=Chennai  ?date_from=2025-07-01  ?date_to=2025-12-31  ?search=Rock
```

**Seat map response:**
```json
{
  "rows": {
    "A": [{ "seat_id": 1, "seat_type": "VIP", "is_available": 1, "price": "1200.00" }],
    "B": [...]
  },
  "summary": { "total": 50, "available": 47, "booked": 3 }
}
```

**Rating distribution response:**
```json
{
  "avg_rating": 4.5,
  "total_reviews": 12,
  "distribution": {
    "5": { "count": 8, "percentage": 66.7 },
    "4": { "count": 3, "percentage": 25.0 },
    "3": { "count": 1, "percentage": 8.3 },
    "2": { "count": 0, "percentage": 0 },
    "1": { "count": 0, "percentage": 0 }
  }
}
```

---

### Bookings — `/api/bookings`
| Method | Endpoint         | Auth      | Description                      |
|--------|-----------------|-----------|----------------------------------|
| POST   | /               | Protected | Create booking (transactional)   |
| GET    | /my             | Protected | User's bookings                  |
| GET    | /:id            | Protected | Single booking detail            |
| PATCH  | /:id/cancel     | Protected | Cancel + restore seats           |
| GET    | /               | Admin     | All bookings                     |

**POST /api/bookings:**
```json
{
  "event_id": 1,
  "seat_ids": [4, 5, 6],
  "payment_method": "UPI",
  "food_items": [
    { "food_id": 1, "quantity": 2 },
    { "food_id": 9, "quantity": 1 }
  ]
}
```

---

### Reviews — `/api/reviews`
| Method | Endpoint       | Auth      | Description                     |
|--------|---------------|-----------|----------------------------------|
| POST   | /             | Protected | Submit review (needs booking)    |
| GET    | /my           | Protected | User's own reviews               |
| PUT    | /:reviewId    | Protected | Update own review                |
| DELETE | /:reviewId    | Protected | Delete (owner or admin)          |

---

### Tickets — `/api/tickets`
| Method | Endpoint                | Auth      | Description               |
|--------|------------------------|-----------|---------------------------|
| GET    | /:bookingId/download   | Protected | Download PDF ticket       |
| GET    | /:bookingId/qr         | Protected | Get QR code (base64 PNG)  |

---

### Payments — `/api/payments`
| Method | Endpoint                    | Auth      | Description              |
|--------|-----------------------------|-----------|--------------------------|
| GET    | /booking/:bookingId         | Protected | Payment for booking      |
| POST   | /:bookingId/verify          | Protected | Verify / update payment  |
| GET    | /                           | Admin     | All payments             |

---

### Food — `/api/food`
| Method | Endpoint | Auth  | Description      |
|--------|---------|-------|-----------------|
| GET    | /       | None  | Menu list        |
| POST   | /       | Admin | Add food item    |

`?veg_only=true` filter available.

---

### Admin — `/api/admin`
| Method | Endpoint               | Auth  | Description                    |
|--------|----------------------|-------|-------------------------------|
| GET    | /analytics            | Admin | Dashboard overview             |
| GET    | /bookings/report      | Admin | Cursor-based booking report    |
| GET    | /users                | Admin | All users + booking stats      |
| POST   | /email/test           | Admin | Send test email                |
| POST   | /email/send-bulk      | Admin | Bulk email to all users        |

---

## ⚙️ Database Integration

| Feature              | How it's used in the API                                         |
|----------------------|------------------------------------------------------------------|
| **Transactions**     | `createBooking` and `cancelBooking` use full BEGIN/COMMIT/ROLLBACK |
| **Stored Procedures**| `sp_safe_review_insert`, `sp_booking_report`, `generate_seat_map` called directly |
| **Triggers**         | Seat availability + avg_rating updated automatically by DB triggers |
| **Foreign Keys**     | Enforced at DB level; API returns clean 400 errors on violation  |
| **Unique Constraints**| One review per user/event; unique seats per event               |

---

## 📧 Email System

Emails are sent automatically at these events:

| Trigger                  | Email sent                         |
|--------------------------|------------------------------------|
| User registers           | Welcome email                      |
| Booking confirmed        | Confirmation + PDF ticket attached |
| Booking cancelled        | Cancellation notice                |
| 24 hours before event    | Reminder (cron, runs hourly)       |
| 1 day after event ends   | Review request (cron, daily 10 AM) |

**Gmail setup:** Go to `myaccount.google.com → Security → 2-Step Verification → App passwords` and generate a 16-character password for "Mail".

---

## 🧪 Quick Test Commands

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Test User","email":"test@test.com","password":"test123"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"test123"}'

# Get events
curl http://localhost:5000/api/events

# Get seat map
curl http://localhost:5000/api/events/1/seats

# Book seats (replace TOKEN)
curl -X POST http://localhost:5000/api/bookings \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":1,"seat_ids":[4,5],"payment_method":"UPI"}'

# Submit review
curl -X POST http://localhost:5000/api/reviews \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"event_id":1,"rating":5,"comment":"Amazing!"}'

# Download ticket
curl http://localhost:5000/api/tickets/1/download \
  -H "Authorization: Bearer TOKEN" --output ticket.pdf

# Admin analytics
curl http://localhost:5000/api/admin/analytics \
  -H "Authorization: Bearer ADMIN_TOKEN"
```

---

## 🛡️ Security Features

- **Helmet** – secure HTTP headers on every response
- **Rate limiting** – 100 req/15min globally; 10 req/15min on auth routes
- **JWT** – stateless authentication, 7-day expiry
- **bcrypt** – password hashing (10 rounds)
- **Input validation** – express-validator on all POST/PUT routes
- **SQL injection protection** – parameterized queries throughout

---

## 🌱 Database Prerequisites

The following column is needed for the reminder cron job to avoid re-sending:

```sql
ALTER TABLE bookings ADD COLUMN reminder_sent TINYINT(1) NOT NULL DEFAULT 0;
```

Run this once after setting up the main schema.

---

## 📦 Environment Variables

| Variable        | Description                          | Default       |
|-----------------|--------------------------------------|---------------|
| PORT            | Server port                          | 5000          |
| DB_HOST         | MySQL host                           | localhost     |
| DB_USER         | MySQL username                       | root          |
| DB_PASSWORD     | MySQL password                       | (required)    |
| DB_NAME         | Database name                        | EVENTRA       |
| JWT_SECRET      | JWT signing secret                   | (required)    |
| JWT_EXPIRES_IN  | Token validity                       | 7d            |
| EMAIL_USER      | Gmail address                        | (optional)    |
| EMAIL_PASSWORD  | Gmail App Password                   | (optional)    |
| EMAIL_FROM      | Sender display name                  | (optional)    |
| FRONTEND_URL    | Used in email links + CORS origin    | *             |
