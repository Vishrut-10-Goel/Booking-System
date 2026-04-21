-- ============================================================
--  EVENTRA – CLEAN PRODUCTION DATABASE SCRIPT
--  Aligned with Node.js + Express backend v3.0
--  Removed: redundant demo queries, duplicate operations,
--           trg_before_booking_insert (FK already enforces this),
--           trg_after_payment_insert (backend controls status flow)
--  Kept:    All DDL, clean seed data, 4 essential triggers,
--           all 6 procedures/functions, views, indexes
-- ============================================================

CREATE DATABASE IF NOT EXISTS EVENTRA;
USE EVENTRA;

-- ============================================================
--  PART 1 – DROP & RECREATE (safe re-run)
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS booking_food;
DROP TABLE IF EXISTS food_items;
DROP TABLE IF EXISTS booking_seats;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS seats;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS venues;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  PART 2 – DDL: CREATE TABLES
-- ============================================================

CREATE TABLE categories (
    category_id   INT          NOT NULL AUTO_INCREMENT,
    category_name VARCHAR(100) NOT NULL,
    description   TEXT,
    CONSTRAINT pk_categories    PRIMARY KEY (category_id),
    CONSTRAINT uq_category_name UNIQUE (category_name)
);

CREATE TABLE venues (
    venue_id   INT          NOT NULL AUTO_INCREMENT,
    venue_name VARCHAR(150) NOT NULL,
    city       VARCHAR(100) NOT NULL,
    state      VARCHAR(100) NOT NULL DEFAULT 'Tamil Nadu',
    capacity   INT          NOT NULL,
    address    TEXT         NOT NULL,
    CONSTRAINT pk_venues         PRIMARY KEY (venue_id),
    CONSTRAINT chk_venue_capacity CHECK (capacity > 0)
);

-- is_admin flag used by JWT middleware for role-based access
CREATE TABLE users (
    user_id       INT          NOT NULL AUTO_INCREMENT,
    full_name     VARCHAR(150) NOT NULL,
    email         VARCHAR(150) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin      TINYINT(1)   NOT NULL DEFAULT 0,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_users PRIMARY KEY (user_id),
    CONSTRAINT uq_email UNIQUE (email)
);

-- avg_rating auto-maintained by trg_after_review_insert / trg_after_review_update
CREATE TABLE events (
    event_id    INT           NOT NULL AUTO_INCREMENT,
    title       VARCHAR(200)  NOT NULL,
    description TEXT,
    event_date  DATE          NOT NULL,
    event_time  TIME          NOT NULL,
    venue_id    INT           NOT NULL,
    category_id INT           NOT NULL,
    base_price  DECIMAL(10,2) NOT NULL,
    avg_rating  DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
    CONSTRAINT pk_events         PRIMARY KEY (event_id),
    CONSTRAINT fk_event_venue    FOREIGN KEY (venue_id)    REFERENCES venues(venue_id),
    CONSTRAINT fk_event_category FOREIGN KEY (category_id) REFERENCES categories(category_id),
    CONSTRAINT chk_base_price    CHECK (base_price >= 0),
    CONSTRAINT chk_avg_rating    CHECK (avg_rating BETWEEN 0.00 AND 5.00)
);

-- is_available auto-set to 0 by trg_after_booking_seat_insert
CREATE TABLE seats (
    seat_id      INT           NOT NULL AUTO_INCREMENT,
    event_id     INT           NOT NULL,
    row_letter   CHAR(1)       NOT NULL,
    seat_number  INT           NOT NULL,
    seat_type    ENUM('VIP','PREMIUM','REGULAR') NOT NULL DEFAULT 'REGULAR',
    is_available TINYINT(1)    NOT NULL DEFAULT 1,
    price        DECIMAL(10,2) NOT NULL,
    CONSTRAINT pk_seats       PRIMARY KEY (seat_id),
    CONSTRAINT fk_seat_event  FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT uq_seat        UNIQUE (event_id, row_letter, seat_number),
    CONSTRAINT chk_seat_price CHECK (price >= 0)
);

-- reminder_sent used by emailScheduler cron job
CREATE TABLE bookings (
    booking_id     INT           NOT NULL AUTO_INCREMENT,
    user_id        INT           NOT NULL,
    event_id       INT           NOT NULL,
    booking_date   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    total_amount   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    booking_status VARCHAR(20)   NOT NULL DEFAULT 'CONFIRMED',
    reminder_sent  TINYINT(1)    NOT NULL DEFAULT 0,
    CONSTRAINT pk_bookings        PRIMARY KEY (booking_id),
    CONSTRAINT fk_booking_user    FOREIGN KEY (user_id)  REFERENCES users(user_id),
    CONSTRAINT fk_booking_event   FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT chk_booking_status CHECK (booking_status IN ('CONFIRMED','CANCELLED','PENDING')),
    CONSTRAINT chk_total_amount   CHECK (total_amount >= 0)
);

-- seat marked unavailable via trigger on INSERT here
CREATE TABLE booking_seats (
    bs_id      INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    seat_id    INT NOT NULL,
    CONSTRAINT pk_booking_seats PRIMARY KEY (bs_id),
    CONSTRAINT fk_bs_booking    FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT fk_bs_seat       FOREIGN KEY (seat_id)    REFERENCES seats(seat_id),
    CONSTRAINT uq_booking_seat  UNIQUE (booking_id, seat_id)
);

CREATE TABLE food_items (
    food_id   INT          NOT NULL AUTO_INCREMENT,
    food_name VARCHAR(150) NOT NULL,
    price     DECIMAL(8,2) NOT NULL,
    is_veg    TINYINT(1)   NOT NULL DEFAULT 1,
    CONSTRAINT pk_food_items PRIMARY KEY (food_id),
    CONSTRAINT chk_food_price CHECK (price >= 0)
);

CREATE TABLE booking_food (
    bf_id      INT NOT NULL AUTO_INCREMENT,
    booking_id INT NOT NULL,
    food_id    INT NOT NULL,
    quantity   INT NOT NULL DEFAULT 1,
    CONSTRAINT pk_booking_food PRIMARY KEY (bf_id),
    CONSTRAINT fk_bf_booking   FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT fk_bf_food      FOREIGN KEY (food_id)    REFERENCES food_items(food_id),
    CONSTRAINT chk_quantity    CHECK (quantity > 0)
);

-- One payment per booking (UNIQUE constraint)
CREATE TABLE payments (
    payment_id     INT           NOT NULL AUTO_INCREMENT,
    booking_id     INT           NOT NULL,
    amount         DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(50)   NOT NULL DEFAULT 'UPI',
    payment_status ENUM('PENDING','SUCCESS','FAILED') NOT NULL DEFAULT 'PENDING',
    paid_at        DATETIME      DEFAULT NULL,
    CONSTRAINT pk_payments        PRIMARY KEY (payment_id),
    CONSTRAINT fk_pay_booking     FOREIGN KEY (booking_id) REFERENCES bookings(booking_id),
    CONSTRAINT uq_payment_booking UNIQUE (booking_id),
    CONSTRAINT chk_pay_amount     CHECK (amount >= 0)
);

-- One review per user per event (UNIQUE constraint)
CREATE TABLE reviews (
    review_id   INT     NOT NULL AUTO_INCREMENT,
    user_id     INT     NOT NULL,
    event_id    INT     NOT NULL,
    rating      TINYINT NOT NULL,
    comment     TEXT,
    reviewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT pk_reviews    PRIMARY KEY (review_id),
    CONSTRAINT fk_rev_user   FOREIGN KEY (user_id)  REFERENCES users(user_id),
    CONSTRAINT fk_rev_event  FOREIGN KEY (event_id) REFERENCES events(event_id),
    CONSTRAINT uq_user_event UNIQUE (user_id, event_id),
    CONSTRAINT chk_rating    CHECK (rating BETWEEN 1 AND 5)
);

-- ============================================================
--  PART 3 – INDEXES (performance for backend queries)
-- ============================================================

-- Events: filter by date, category, venue
CREATE INDEX idx_events_date     ON events (event_date);
CREATE INDEX idx_events_category ON events (category_id);
CREATE INDEX idx_events_venue    ON events (venue_id);

-- Seats: availability lookup (seat map API)
CREATE INDEX idx_seats_event     ON seats (event_id);
CREATE INDEX idx_seats_available ON seats (event_id, is_available);

-- Bookings: user history, status filter
CREATE INDEX idx_bookings_user   ON bookings (user_id);
CREATE INDEX idx_bookings_event  ON bookings (event_id);
CREATE INDEX idx_bookings_status ON bookings (booking_status);

-- Booking seats: seat ownership lookup
CREATE INDEX idx_bs_booking ON booking_seats (booking_id);
CREATE INDEX idx_bs_seat    ON booking_seats (seat_id);

-- Reviews: event review listing
CREATE INDEX idx_reviews_event ON reviews (event_id);
CREATE INDEX idx_reviews_user  ON reviews (user_id);

-- Payments: status filter for admin
CREATE INDEX idx_payments_status ON payments (payment_status);


-- ============================================================
--  PART 4 – SEED DATA
-- ============================================================

INSERT INTO categories (category_name, description) VALUES
    ('Music',  'Live concerts and music festivals'),
    ('Sports', 'Cricket, kabaddi, football and other sports events'),
    ('Comedy', 'Stand-up shows and open mic events');

INSERT INTO venues (venue_name, city, state, capacity, address) VALUES
    ('YMCA Ground',             'Chennai',   'Tamil Nadu', 5000,  '13, Nandanam, Chennai – 600035'),
    ('Jawaharlal Nehru Stadium', 'Chennai',   'Tamil Nadu', 40000, 'Periyamet, Chennai – 600003'),
    ('Phoenix MarketCity Arena', 'Bangalore', 'Karnataka',  2000,  'Whitefield, Bangalore – 560066');

-- User 1 is admin, users 2–5 are regular customers
INSERT INTO users (user_id, full_name, email, password_hash, is_admin, created_at) VALUES
    (1, 'Arjun Ramesh',   'arjun.r@gmail.com',         '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 1, '2025-01-10 09:00:00'),
    (2, 'Priya Suresh',   'priya.s@gmail.com',         '$2a$10$rJJBOkbMKQRNMWBOs6P.1.SgNvmLTRHOxZUe5S4sSjZ/aLuePHB9u', 0, '2025-01-12 10:30:00'),
    (3, 'Karthik Vijay',  'karthik.v@gmail.com',       '$2a$10$rJJBOkbMKQRNMWBOs6P.1.SgNvmLTRHOxZUe5S4sSjZ/aLuePHB9u', 0, '2025-02-01 11:00:00'),
    (4, 'Meena Krishnan', 'meena.k@gmail.com',         '$2a$10$rJJBOkbMKQRNMWBOs6P.1.SgNvmLTRHOxZUe5S4sSjZ/aLuePHB9u', 0, '2025-02-15 08:45:00'),
    (5, 'Surya Prakash',  'surya.p@gmail.com',         '$2a$10$rJJBOkbMKQRNMWBOs6P.1.SgNvmLTRHOxZUe5S4sSjZ/aLuePHB9u', 0, '2025-03-01 07:30:00'),
    (6, 'Vishrut Goel',   'goelvishrut7@gmail.com',    '$2a$10$XVMqCBbMr9G2VD7vmRBfwuY3H0.C4sPcNBjx4A3E9pMQzHQJGr5Iu',                                                     1, '2025-01-01 08:00:00');

INSERT INTO events (title, description, event_date, event_time, venue_id, category_id, base_price) VALUES
    ('Chennai Rocks 2025',        'Biggest rock concert in South India',   '2025-07-15', '18:00:00', 1, 1, 500.00),
    ('IPL Fan Night',             'CSK vs MI live screening with fanfare', '2025-08-10', '19:30:00', 2, 2, 300.00),
    ('Comicstaan Live',           'Top comedians from Amazon series',      '2025-08-25', '20:00:00', 3, 3, 750.00),
    ('Carnatic Fusion Night',     'Classical meets contemporary music',    '2025-09-05', '17:30:00', 1, 1, 400.00),
    ('Pro Kabaddi Fan Fest 2025', 'Live viewing with player meet',         '2025-09-20', '18:30:00', 2, 2, 200.00);

-- 50 seats per event (rows A–E, 10 seats each): A=VIP, B=PREMIUM, C-E=REGULAR
INSERT INTO seats (event_id,row_letter,seat_number,seat_type,price) VALUES
(1,'A',1,'VIP',1200),(1,'A',2,'VIP',1200),(1,'A',3,'VIP',1200),(1,'A',4,'VIP',1200),(1,'A',5,'VIP',1200),
(1,'A',6,'VIP',1200),(1,'A',7,'VIP',1200),(1,'A',8,'VIP',1200),(1,'A',9,'VIP',1200),(1,'A',10,'VIP',1200),
(1,'B',1,'PREMIUM',800),(1,'B',2,'PREMIUM',800),(1,'B',3,'PREMIUM',800),(1,'B',4,'PREMIUM',800),(1,'B',5,'PREMIUM',800),
(1,'B',6,'PREMIUM',800),(1,'B',7,'PREMIUM',800),(1,'B',8,'PREMIUM',800),(1,'B',9,'PREMIUM',800),(1,'B',10,'PREMIUM',800),
(1,'C',1,'REGULAR',500),(1,'C',2,'REGULAR',500),(1,'C',3,'REGULAR',500),(1,'C',4,'REGULAR',500),(1,'C',5,'REGULAR',500),
(1,'C',6,'REGULAR',500),(1,'C',7,'REGULAR',500),(1,'C',8,'REGULAR',500),(1,'C',9,'REGULAR',500),(1,'C',10,'REGULAR',500),
(1,'D',1,'REGULAR',500),(1,'D',2,'REGULAR',500),(1,'D',3,'REGULAR',500),(1,'D',4,'REGULAR',500),(1,'D',5,'REGULAR',500),
(1,'D',6,'REGULAR',500),(1,'D',7,'REGULAR',500),(1,'D',8,'REGULAR',500),(1,'D',9,'REGULAR',500),(1,'D',10,'REGULAR',500),
(1,'E',1,'REGULAR',500),(1,'E',2,'REGULAR',500),(1,'E',3,'REGULAR',500),(1,'E',4,'REGULAR',500),(1,'E',5,'REGULAR',500),
(1,'E',6,'REGULAR',500),(1,'E',7,'REGULAR',500),(1,'E',8,'REGULAR',500),(1,'E',9,'REGULAR',500),(1,'E',10,'REGULAR',500);

INSERT INTO seats (event_id,row_letter,seat_number,seat_type,price) VALUES
(2,'A',1,'VIP',800),(2,'A',2,'VIP',800),(2,'A',3,'VIP',800),(2,'A',4,'VIP',800),(2,'A',5,'VIP',800),
(2,'A',6,'VIP',800),(2,'A',7,'VIP',800),(2,'A',8,'VIP',800),(2,'A',9,'VIP',800),(2,'A',10,'VIP',800),
(2,'B',1,'PREMIUM',500),(2,'B',2,'PREMIUM',500),(2,'B',3,'PREMIUM',500),(2,'B',4,'PREMIUM',500),(2,'B',5,'PREMIUM',500),
(2,'B',6,'PREMIUM',500),(2,'B',7,'PREMIUM',500),(2,'B',8,'PREMIUM',500),(2,'B',9,'PREMIUM',500),(2,'B',10,'PREMIUM',500),
(2,'C',1,'REGULAR',300),(2,'C',2,'REGULAR',300),(2,'C',3,'REGULAR',300),(2,'C',4,'REGULAR',300),(2,'C',5,'REGULAR',300),
(2,'C',6,'REGULAR',300),(2,'C',7,'REGULAR',300),(2,'C',8,'REGULAR',300),(2,'C',9,'REGULAR',300),(2,'C',10,'REGULAR',300),
(2,'D',1,'REGULAR',300),(2,'D',2,'REGULAR',300),(2,'D',3,'REGULAR',300),(2,'D',4,'REGULAR',300),(2,'D',5,'REGULAR',300),
(2,'D',6,'REGULAR',300),(2,'D',7,'REGULAR',300),(2,'D',8,'REGULAR',300),(2,'D',9,'REGULAR',300),(2,'D',10,'REGULAR',300),
(2,'E',1,'REGULAR',300),(2,'E',2,'REGULAR',300),(2,'E',3,'REGULAR',300),(2,'E',4,'REGULAR',300),(2,'E',5,'REGULAR',300),
(2,'E',6,'REGULAR',300),(2,'E',7,'REGULAR',300),(2,'E',8,'REGULAR',300),(2,'E',9,'REGULAR',300),(2,'E',10,'REGULAR',300);

INSERT INTO seats (event_id,row_letter,seat_number,seat_type,price) VALUES
(3,'A',1,'VIP',1800),(3,'A',2,'VIP',1800),(3,'A',3,'VIP',1800),(3,'A',4,'VIP',1800),(3,'A',5,'VIP',1800),
(3,'A',6,'VIP',1800),(3,'A',7,'VIP',1800),(3,'A',8,'VIP',1800),(3,'A',9,'VIP',1800),(3,'A',10,'VIP',1800),
(3,'B',1,'PREMIUM',1200),(3,'B',2,'PREMIUM',1200),(3,'B',3,'PREMIUM',1200),(3,'B',4,'PREMIUM',1200),(3,'B',5,'PREMIUM',1200),
(3,'B',6,'PREMIUM',1200),(3,'B',7,'PREMIUM',1200),(3,'B',8,'PREMIUM',1200),(3,'B',9,'PREMIUM',1200),(3,'B',10,'PREMIUM',1200),
(3,'C',1,'REGULAR',750),(3,'C',2,'REGULAR',750),(3,'C',3,'REGULAR',750),(3,'C',4,'REGULAR',750),(3,'C',5,'REGULAR',750),
(3,'C',6,'REGULAR',750),(3,'C',7,'REGULAR',750),(3,'C',8,'REGULAR',750),(3,'C',9,'REGULAR',750),(3,'C',10,'REGULAR',750),
(3,'D',1,'REGULAR',750),(3,'D',2,'REGULAR',750),(3,'D',3,'REGULAR',750),(3,'D',4,'REGULAR',750),(3,'D',5,'REGULAR',750),
(3,'D',6,'REGULAR',750),(3,'D',7,'REGULAR',750),(3,'D',8,'REGULAR',750),(3,'D',9,'REGULAR',750),(3,'D',10,'REGULAR',750),
(3,'E',1,'REGULAR',750),(3,'E',2,'REGULAR',750),(3,'E',3,'REGULAR',750),(3,'E',4,'REGULAR',750),(3,'E',5,'REGULAR',750),
(3,'E',6,'REGULAR',750),(3,'E',7,'REGULAR',750),(3,'E',8,'REGULAR',750),(3,'E',9,'REGULAR',750),(3,'E',10,'REGULAR',750);

INSERT INTO seats (event_id,row_letter,seat_number,seat_type,price) VALUES
(4,'A',1,'VIP',1000),(4,'A',2,'VIP',1000),(4,'A',3,'VIP',1000),(4,'A',4,'VIP',1000),(4,'A',5,'VIP',1000),
(4,'A',6,'VIP',1000),(4,'A',7,'VIP',1000),(4,'A',8,'VIP',1000),(4,'A',9,'VIP',1000),(4,'A',10,'VIP',1000),
(4,'B',1,'PREMIUM',700),(4,'B',2,'PREMIUM',700),(4,'B',3,'PREMIUM',700),(4,'B',4,'PREMIUM',700),(4,'B',5,'PREMIUM',700),
(4,'B',6,'PREMIUM',700),(4,'B',7,'PREMIUM',700),(4,'B',8,'PREMIUM',700),(4,'B',9,'PREMIUM',700),(4,'B',10,'PREMIUM',700),
(4,'C',1,'REGULAR',400),(4,'C',2,'REGULAR',400),(4,'C',3,'REGULAR',400),(4,'C',4,'REGULAR',400),(4,'C',5,'REGULAR',400),
(4,'C',6,'REGULAR',400),(4,'C',7,'REGULAR',400),(4,'C',8,'REGULAR',400),(4,'C',9,'REGULAR',400),(4,'C',10,'REGULAR',400),
(4,'D',1,'REGULAR',400),(4,'D',2,'REGULAR',400),(4,'D',3,'REGULAR',400),(4,'D',4,'REGULAR',400),(4,'D',5,'REGULAR',400),
(4,'D',6,'REGULAR',400),(4,'D',7,'REGULAR',400),(4,'D',8,'REGULAR',400),(4,'D',9,'REGULAR',400),(4,'D',10,'REGULAR',400),
(4,'E',1,'REGULAR',400),(4,'E',2,'REGULAR',400),(4,'E',3,'REGULAR',400),(4,'E',4,'REGULAR',400),(4,'E',5,'REGULAR',400),
(4,'E',6,'REGULAR',400),(4,'E',7,'REGULAR',400),(4,'E',8,'REGULAR',400),(4,'E',9,'REGULAR',400),(4,'E',10,'REGULAR',400);

INSERT INTO seats (event_id,row_letter,seat_number,seat_type,price) VALUES
(5,'A',1,'VIP',600),(5,'A',2,'VIP',600),(5,'A',3,'VIP',600),(5,'A',4,'VIP',600),(5,'A',5,'VIP',600),
(5,'A',6,'VIP',600),(5,'A',7,'VIP',600),(5,'A',8,'VIP',600),(5,'A',9,'VIP',600),(5,'A',10,'VIP',600),
(5,'B',1,'PREMIUM',400),(5,'B',2,'PREMIUM',400),(5,'B',3,'PREMIUM',400),(5,'B',4,'PREMIUM',400),(5,'B',5,'PREMIUM',400),
(5,'B',6,'PREMIUM',400),(5,'B',7,'PREMIUM',400),(5,'B',8,'PREMIUM',400),(5,'B',9,'PREMIUM',400),(5,'B',10,'PREMIUM',400),
(5,'C',1,'REGULAR',200),(5,'C',2,'REGULAR',200),(5,'C',3,'REGULAR',200),(5,'C',4,'REGULAR',200),(5,'C',5,'REGULAR',200),
(5,'C',6,'REGULAR',200),(5,'C',7,'REGULAR',200),(5,'C',8,'REGULAR',200),(5,'C',9,'REGULAR',200),(5,'C',10,'REGULAR',200),
(5,'D',1,'REGULAR',200),(5,'D',2,'REGULAR',200),(5,'D',3,'REGULAR',200),(5,'D',4,'REGULAR',200),(5,'D',5,'REGULAR',200),
(5,'D',6,'REGULAR',200),(5,'D',7,'REGULAR',200),(5,'D',8,'REGULAR',200),(5,'D',9,'REGULAR',200),(5,'D',10,'REGULAR',200),
(5,'E',1,'REGULAR',200),(5,'E',2,'REGULAR',200),(5,'E',3,'REGULAR',200),(5,'E',4,'REGULAR',200),(5,'E',5,'REGULAR',200),
(5,'E',6,'REGULAR',200),(5,'E',7,'REGULAR',200),(5,'E',8,'REGULAR',200),(5,'E',9,'REGULAR',200),(5,'E',10,'REGULAR',200);

INSERT INTO food_items (food_id,food_name,price,is_veg) VALUES
(1,'Popcorn (Salted)',80.00,1),(2,'Popcorn (Caramel)',90.00,1),
(3,'Samosa Combo (2 pcs)',60.00,1),(4,'Masala Chai',40.00,1),
(5,'Cold Coffee',120.00,1),(6,'Chicken Tikka Roll',180.00,0),
(7,'Veg Sandwich',90.00,1),(8,'Nachos with Dip',150.00,1),
(9,'Mineral Water (500ml)',30.00,1),(10,'Pepsi (500ml)',60.00,1);

-- Bookings: IDs match booking_seats and payments below
INSERT INTO bookings (booking_id,user_id,event_id,booking_date,total_amount,booking_status) VALUES
(1,1,1,'2025-06-01 10:00:00',2400.00,'CONFIRMED'),
(2,2,2,'2025-06-05 11:30:00',1600.00,'CONFIRMED'),
(3,3,3,'2025-06-10 09:00:00',3600.00,'CONFIRMED'),
(4,4,1,'2025-06-12 14:00:00',1000.00,'CONFIRMED'),
(5,5,4,'2025-06-15 16:00:00',2000.00,'CONFIRMED');

INSERT INTO booking_seats (booking_id,seat_id) VALUES
(1,1),(1,2),(1,3),
(2,51),(2,52),(2,53),(2,54),
(3,101),(3,102),(3,103),
(4,21),(4,22),
(5,151),(5,152),(5,153),(5,154),(5,155);

-- Mark booked seats unavailable (triggers do this on fresh inserts,
-- but seed data bypasses triggers so we set manually)
UPDATE seats SET is_available=0
WHERE seat_id IN (1,2,3,51,52,53,54,101,102,103,21,22,151,152,153,154,155);

INSERT INTO booking_food (booking_id,food_id,quantity) VALUES
(1,1,2),(1,9,3),
(2,6,2),(2,5,2),
(3,8,1),(3,4,3),
(4,2,1),
(5,10,2);

INSERT INTO payments (booking_id,amount,payment_method,payment_status,paid_at) VALUES
(1,2400.00,'UPI',         'SUCCESS','2025-06-01 10:05:00'),
(2,1600.00,'Debit Card',  'SUCCESS','2025-06-05 11:35:00'),
(3,3600.00,'Net Banking', 'SUCCESS','2025-06-10 09:10:00'),
(4,1000.00,'UPI',         'SUCCESS','2025-06-12 14:05:00'),
(5,2000.00,'Credit Card', 'SUCCESS','2025-06-15 16:10:00');

INSERT INTO reviews (user_id,event_id,rating,comment) VALUES
(1,1,5,'Absolutely electric atmosphere! Chennai Rocks was phenomenal.'),
(2,2,4,'Great fanfare. Audio could have been better.'),
(3,3,5,'Comicstaan Live was hilarious. Worth every rupee!'),
(4,1,4,'Great event, seating was comfortable.');

-- Sync avg_rating for seeded reviews (triggers fire on live inserts only)
UPDATE events
SET avg_rating = (
    SELECT ROUND(AVG(rating),2) FROM reviews WHERE reviews.event_id = events.event_id
)
WHERE event_id IN (1,2,3);


-- ============================================================
--  PART 5 – VIEWS (used by admin analytics)
-- ============================================================

DROP VIEW IF EXISTS vw_booking_summary;
CREATE VIEW vw_booking_summary AS
SELECT
    b.booking_id,
    u.full_name        AS customer_name,
    e.title            AS event_name,
    v.venue_name,
    v.city,
    b.booking_date,
    b.total_amount,
    b.booking_status,
    p.payment_status,
    p.payment_method
FROM bookings b
JOIN users    u ON b.user_id    = u.user_id
JOIN events   e ON b.event_id   = e.event_id
JOIN venues   v ON e.venue_id   = v.venue_id
LEFT JOIN payments p ON b.booking_id = p.booking_id;

DROP VIEW IF EXISTS vw_available_seats;
CREATE VIEW vw_available_seats AS
SELECT
    e.event_id,
    e.title,
    s.seat_type,
    COUNT(*)       AS available_count,
    MIN(s.price)   AS min_price
FROM seats s
JOIN events e ON s.event_id = e.event_id
WHERE s.is_available = 1
GROUP BY e.event_id, e.title, s.seat_type;

DROP VIEW IF EXISTS vw_event_revenue;
CREATE VIEW vw_event_revenue AS
SELECT
    e.event_id,
    e.title,
    e.event_date,
    COUNT(b.booking_id)    AS total_bookings,
    COALESCE(SUM(b.total_amount),0) AS total_revenue,
    e.avg_rating
FROM events e
LEFT JOIN bookings b ON e.event_id = b.event_id
    AND b.booking_status = 'CONFIRMED'
GROUP BY e.event_id, e.title, e.event_date, e.avg_rating;


-- ============================================================
--  PART 6 – STORED PROCEDURES & FUNCTIONS
-- ============================================================

DROP PROCEDURE IF EXISTS sp_create_booking;
DROP PROCEDURE IF EXISTS sp_update_payment_status;
DROP PROCEDURE IF EXISTS sp_insert_user;
DROP PROCEDURE IF EXISTS generate_seat_map;
DROP PROCEDURE IF EXISTS sp_booking_report;
DROP PROCEDURE IF EXISTS sp_safe_review_insert;
DROP FUNCTION  IF EXISTS fn_total_booking_cost;
DROP FUNCTION  IF EXISTS fn_is_seat_available;
DROP FUNCTION  IF EXISTS fn_get_event_rating;

DELIMITER $$

-- ----------------------------------------------------------
-- PROCEDURE 1: Create a booking with 2 seats + optional food
-- Called from: backend bookingController (demo/test path)
-- ----------------------------------------------------------
CREATE PROCEDURE sp_create_booking(
    IN  p_user_id    INT,
    IN  p_event_id   INT,
    IN  p_seat_id1   INT,
    IN  p_seat_id2   INT,
    IN  p_food_id    INT,
    IN  p_food_qty   INT,
    OUT p_booking_id INT,
    OUT p_message    VARCHAR(200)
)
BEGIN
    DECLARE v_avail1 TINYINT  DEFAULT 0;
    DECLARE v_avail2 TINYINT  DEFAULT 0;
    DECLARE v_price1 DECIMAL(10,2) DEFAULT 0;
    DECLARE v_price2 DECIMAL(10,2) DEFAULT 0;
    DECLARE v_total  DECIMAL(10,2) DEFAULT 0;

    SELECT is_available, price INTO v_avail1, v_price1 FROM seats WHERE seat_id = p_seat_id1;
    SELECT is_available, price INTO v_avail2, v_price2 FROM seats WHERE seat_id = p_seat_id2;

    IF v_avail1 = 0 OR v_avail2 = 0 THEN
        SET p_booking_id = -1;
        SET p_message    = 'ERROR: One or more seats are not available.';
    ELSE
        SET v_total = v_price1 + v_price2;
        START TRANSACTION;
            INSERT INTO bookings (user_id,event_id,total_amount,booking_status)
            VALUES (p_user_id, p_event_id, v_total, 'CONFIRMED');
            SET p_booking_id = LAST_INSERT_ID();
            INSERT INTO booking_seats (booking_id,seat_id) VALUES (p_booking_id, p_seat_id1);
            INSERT INTO booking_seats (booking_id,seat_id) VALUES (p_booking_id, p_seat_id2);
            -- Trigger trg_after_booking_seat_insert marks seats unavailable
            IF p_food_id > 0 AND p_food_qty > 0 THEN
                INSERT INTO booking_food (booking_id,food_id,quantity)
                VALUES (p_booking_id, p_food_id, p_food_qty);
            END IF;
            INSERT INTO payments (booking_id,amount,payment_method,payment_status)
            VALUES (p_booking_id, v_total, 'UPI', 'PENDING');
        COMMIT;
        SET p_message = CONCAT('SUCCESS: Booking #', p_booking_id, ' created.');
    END IF;
END$$

-- ----------------------------------------------------------
-- PROCEDURE 2: Update payment status + sync booking status
-- Called from: backend paymentController.verifyPayment
-- ----------------------------------------------------------
CREATE PROCEDURE sp_update_payment_status(
    IN p_booking_id INT,
    IN p_status     VARCHAR(20)
)
BEGIN
    UPDATE payments
    SET payment_status = p_status,
        paid_at = CASE WHEN p_status = 'SUCCESS' THEN NOW() ELSE NULL END
    WHERE booking_id = p_booking_id;

    IF p_status = 'FAILED' THEN
        UPDATE bookings SET booking_status = 'CANCELLED' WHERE booking_id = p_booking_id;
    ELSEIF p_status = 'SUCCESS' THEN
        UPDATE bookings SET booking_status = 'CONFIRMED' WHERE booking_id = p_booking_id;
    END IF;

    SELECT CONCAT('Payment for booking #', p_booking_id, ' updated to ', p_status) AS result;
END$$

-- ----------------------------------------------------------
-- PROCEDURE 3: Register new user (duplicate-safe)
-- Called from: backend authController.register
-- ----------------------------------------------------------
CREATE PROCEDURE sp_insert_user(
    IN  p_name     VARCHAR(150),
    IN  p_email    VARCHAR(150),
    IN  p_password VARCHAR(255),
    OUT p_user_id  INT,
    OUT p_message  VARCHAR(200)
)
BEGIN
    DECLARE v_exists INT DEFAULT 0;
    SELECT COUNT(*) INTO v_exists FROM users WHERE email = p_email;
    IF v_exists > 0 THEN
        SET p_user_id = -1;
        SET p_message = 'ERROR: Email already registered.';
    ELSE
        INSERT INTO users (full_name, email, password_hash) VALUES (p_name, p_email, p_password);
        SET p_user_id = LAST_INSERT_ID();
        SET p_message = CONCAT('SUCCESS: User #', p_user_id, ' created.');
    END IF;
END$$

-- ----------------------------------------------------------
-- PROCEDURE 4: Generate seat map for an event
-- Called from: backend seatController.generateSeats
-- Signature: CALL generate_seat_map(event_id, rows, seats_per_row,
--            vip_rows, premium_rows, vip_price, premium_price, regular_price)
-- ----------------------------------------------------------
CREATE PROCEDURE generate_seat_map(
    IN p_event_id      INT,
    IN p_rows          INT,
    IN p_seats_per_row INT,
    IN p_vip_rows      INT,
    IN p_premium_rows  INT,
    IN p_vip_price     DECIMAL(10,2),
    IN p_premium_price DECIMAL(10,2),
    IN p_regular_price DECIMAL(10,2)
)
BEGIN
    DECLARE v_row        INT     DEFAULT 1;
    DECLARE v_seat       INT     DEFAULT 1;
    DECLARE v_row_letter CHAR(1);
    DECLARE v_seat_type  VARCHAR(10);
    DECLARE v_price      DECIMAL(10,2);

    IF (SELECT COUNT(*) FROM events WHERE event_id = p_event_id) = 0 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Event does not exist.';
    END IF;
    IF p_rows < 1 OR p_seats_per_row < 1 THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'rows and seats_per_row must be > 0.';
    END IF;
    IF p_rows > 26 THEN SET p_rows = 26; END IF;

    DELETE FROM seats WHERE event_id = p_event_id;

    WHILE v_row <= p_rows DO
        SET v_row_letter = CHAR(64 + v_row);
        SET v_seat = 1;
        WHILE v_seat <= p_seats_per_row DO
            IF v_row <= p_vip_rows THEN
                SET v_seat_type = 'VIP';     SET v_price = p_vip_price;
            ELSEIF v_row <= (p_vip_rows + p_premium_rows) THEN
                SET v_seat_type = 'PREMIUM'; SET v_price = p_premium_price;
            ELSE
                SET v_seat_type = 'REGULAR'; SET v_price = p_regular_price;
            END IF;
            INSERT INTO seats (event_id,row_letter,seat_number,seat_type,is_available,price)
            VALUES (p_event_id, v_row_letter, v_seat, v_seat_type, 1, v_price);
            SET v_seat = v_seat + 1;
        END WHILE;
        SET v_row = v_row + 1;
    END WHILE;
END$$

-- ----------------------------------------------------------
-- PROCEDURE 5: Booking report via cursor
-- Called from: backend adminController.getBookingReport
-- ----------------------------------------------------------
CREATE PROCEDURE sp_booking_report()
BEGIN
    DECLARE v_booking_id   INT;
    DECLARE v_user_name    VARCHAR(150);
    DECLARE v_event_name   VARCHAR(200);
    DECLARE v_total_amount DECIMAL(10,2);
    DECLARE v_status       VARCHAR(20);
    DECLARE v_done         INT DEFAULT 0;

    DECLARE cur_bookings CURSOR FOR
        SELECT b.booking_id, u.full_name, e.title, b.total_amount, b.booking_status
        FROM bookings b
        JOIN users  u ON b.user_id  = u.user_id
        JOIN events e ON b.event_id = e.event_id
        ORDER BY b.booking_id;

    DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = 1;

    DROP TEMPORARY TABLE IF EXISTS tmp_booking_report;
    CREATE TEMPORARY TABLE tmp_booking_report (
        booking_id   INT,
        customer     VARCHAR(150),
        event_name   VARCHAR(200),
        total_amount DECIMAL(10,2),
        status       VARCHAR(20)
    );

    OPEN cur_bookings;
    booking_loop: LOOP
        FETCH cur_bookings INTO v_booking_id, v_user_name, v_event_name, v_total_amount, v_status;
        IF v_done = 1 THEN LEAVE booking_loop; END IF;
        INSERT INTO tmp_booking_report VALUES (v_booking_id, v_user_name, v_event_name, v_total_amount, v_status);
    END LOOP;
    CLOSE cur_bookings;

    SELECT * FROM tmp_booking_report;
    DROP TEMPORARY TABLE IF EXISTS tmp_booking_report;
END$$

-- ----------------------------------------------------------
-- PROCEDURE 6: Safe review insert with exception handling
-- Called from: backend reviewController.createReview
-- ----------------------------------------------------------
CREATE PROCEDURE sp_safe_review_insert(
    IN  p_user_id  INT,
    IN  p_event_id INT,
    IN  p_rating   TINYINT,
    IN  p_comment  TEXT,
    OUT p_result   VARCHAR(200)
)
BEGIN
    DECLARE EXIT HANDLER FOR SQLSTATE '23000'
    BEGIN
        SET p_result = 'ERROR: You have already reviewed this event.';
        ROLLBACK;
    END;
    DECLARE EXIT HANDLER FOR SQLEXCEPTION
    BEGIN
        SET p_result = 'ERROR: An unexpected SQL error occurred.';
        ROLLBACK;
    END;

    IF p_rating < 1 OR p_rating > 5 THEN
        SET p_result = 'ERROR: Rating must be between 1 and 5.';
    ELSE
        START TRANSACTION;
            INSERT INTO reviews (user_id,event_id,rating,comment)
            VALUES (p_user_id, p_event_id, p_rating, p_comment);
        COMMIT;
        SET p_result = CONCAT('SUCCESS: Review submitted for event #', p_event_id);
    END IF;
END$$

-- ----------------------------------------------------------
-- FUNCTION 1: Total cost of a booking (seats + food)
-- Used in admin queries and analytics
-- ----------------------------------------------------------
CREATE FUNCTION fn_total_booking_cost(p_booking_id INT)
RETURNS DECIMAL(10,2) DETERMINISTIC
BEGIN
    DECLARE v_seat_total DECIMAL(10,2) DEFAULT 0;
    DECLARE v_food_total DECIMAL(10,2) DEFAULT 0;
    SELECT IFNULL(SUM(s.price),0)             INTO v_seat_total
    FROM booking_seats bs JOIN seats s ON bs.seat_id = s.seat_id
    WHERE bs.booking_id = p_booking_id;
    SELECT IFNULL(SUM(fi.price * bf.quantity),0) INTO v_food_total
    FROM booking_food bf JOIN food_items fi ON bf.food_id = fi.food_id
    WHERE bf.booking_id = p_booking_id;
    RETURN v_seat_total + v_food_total;
END$$

-- ----------------------------------------------------------
-- FUNCTION 2: Is a seat available? (returns 1/0)
-- Used in booking validation
-- ----------------------------------------------------------
CREATE FUNCTION fn_is_seat_available(p_seat_id INT)
RETURNS TINYINT(1) DETERMINISTIC
BEGIN
    DECLARE v_available TINYINT(1) DEFAULT 0;
    SELECT is_available INTO v_available FROM seats WHERE seat_id = p_seat_id;
    RETURN IFNULL(v_available, 0);
END$$

-- ----------------------------------------------------------
-- FUNCTION 3: Get average rating of an event
-- Used in event listing queries
-- ----------------------------------------------------------
CREATE FUNCTION fn_get_event_rating(p_event_id INT)
RETURNS DECIMAL(3,2) DETERMINISTIC
BEGIN
    DECLARE v_rating DECIMAL(3,2) DEFAULT 0.00;
    SELECT IFNULL(ROUND(AVG(rating),2),0.00) INTO v_rating
    FROM reviews WHERE event_id = p_event_id;
    RETURN v_rating;
END$$

DELIMITER ;


-- ============================================================
--  PART 7 – TRIGGERS (4 essential triggers only)
--
--  REMOVED:
--    trg_before_booking_insert  → redundant; FK constraints on
--      bookings.user_id and bookings.event_id already reject
--      invalid IDs at the DB level with a cleaner error.
--    trg_after_payment_insert   → redundant; backend explicitly
--      sets booking_status to CONFIRMED/CANCELLED after payment
--      insert, making a trigger doing the same thing race-prone.
--
--  KEPT:
--    trg_after_booking_seat_insert → marks seat unavailable (core)
--    trg_after_booking_seat_delete → restores seat on cancellation
--    trg_after_review_insert       → auto-updates avg_rating
--    trg_after_review_update       → re-syncs avg_rating on edit
-- ============================================================

DROP TRIGGER IF EXISTS trg_before_booking_insert;
DROP TRIGGER IF EXISTS trg_after_booking_seat_insert;
DROP TRIGGER IF EXISTS trg_after_booking_seat_delete;
DROP TRIGGER IF EXISTS trg_after_payment_insert;
DROP TRIGGER IF EXISTS trg_after_review_insert;
DROP TRIGGER IF EXISTS trg_after_review_update;

DELIMITER $$

-- ----------------------------------------------------------
-- TRIGGER 1: Mark seat unavailable when added to a booking
-- Fires on: INSERT into booking_seats
-- ----------------------------------------------------------
CREATE TRIGGER trg_after_booking_seat_insert
AFTER INSERT ON booking_seats
FOR EACH ROW
BEGIN
    UPDATE seats SET is_available = 0 WHERE seat_id = NEW.seat_id;
END$$

-- ----------------------------------------------------------
-- TRIGGER 2: Restore seat availability when booking seat removed
-- Fires on: DELETE from booking_seats (cancellation flow)
-- ----------------------------------------------------------
CREATE TRIGGER trg_after_booking_seat_delete
AFTER DELETE ON booking_seats
FOR EACH ROW
BEGIN
    UPDATE seats SET is_available = 1 WHERE seat_id = OLD.seat_id;
END$$

-- ----------------------------------------------------------
-- TRIGGER 3: Recalculate event avg_rating after new review
-- Fires on: INSERT into reviews
-- ----------------------------------------------------------
CREATE TRIGGER trg_after_review_insert
AFTER INSERT ON reviews
FOR EACH ROW
BEGIN
    UPDATE events
    SET avg_rating = (
        SELECT ROUND(AVG(rating),2) FROM reviews WHERE event_id = NEW.event_id
    )
    WHERE event_id = NEW.event_id;
END$$

-- ----------------------------------------------------------
-- TRIGGER 4: Recalculate event avg_rating after review edited
-- Fires on: UPDATE on reviews
-- ----------------------------------------------------------
CREATE TRIGGER trg_after_review_update
AFTER UPDATE ON reviews
FOR EACH ROW
BEGIN
    UPDATE events
    SET avg_rating = (
        SELECT ROUND(AVG(rating),2) FROM reviews WHERE event_id = NEW.event_id
    )
    WHERE event_id = NEW.event_id;
END$$

DELIMITER ;


-- ============================================================
--  PART 8 – DCL: Application users & privileges
-- ============================================================

CREATE USER IF NOT EXISTS 'eventra_app'@'localhost'    IDENTIFIED BY 'App@1234';
CREATE USER IF NOT EXISTS 'eventra_admin'@'localhost'  IDENTIFIED BY 'Admin@9999';

-- App user: read events/seats, write bookings
GRANT SELECT          ON EVENTRA.events        TO 'eventra_app'@'localhost';
GRANT SELECT          ON EVENTRA.seats         TO 'eventra_app'@'localhost';
GRANT SELECT          ON EVENTRA.categories    TO 'eventra_app'@'localhost';
GRANT SELECT          ON EVENTRA.venues        TO 'eventra_app'@'localhost';
GRANT SELECT          ON EVENTRA.food_items    TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT  ON EVENTRA.users         TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON EVENTRA.bookings      TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT, DELETE ON EVENTRA.booking_seats TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT, DELETE ON EVENTRA.booking_food  TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT, UPDATE ON EVENTRA.payments      TO 'eventra_app'@'localhost';
GRANT SELECT, INSERT, UPDATE, DELETE ON EVENTRA.reviews TO 'eventra_app'@'localhost';

-- Admin user: full access
GRANT ALL PRIVILEGES ON EVENTRA.* TO 'eventra_admin'@'localhost';

FLUSH PRIVILEGES;


-- ============================================================
--  END OF EVENTRA CLEAN PRODUCTION SCRIPT
-- ============================================================
