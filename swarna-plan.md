# Svarna — Jewellery Shop Management System
## Master Build Plan for Claude Code

> **Purpose of this document:** A complete, phase-by-phase specification for building the Svarna platform from scratch. Each phase is designed to be handed to Claude Code as a self-contained unit of work. Complete Phase N fully before starting Phase N+1.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [Repository Structure](#3-repository-structure)
4. [Database Schema](#4-database-schema)
5. [Phase 1 — Foundation](#phase-1--foundation-weeks-13)
6. [Phase 2 — Inventory & Rate Sync](#phase-2--inventory--rate-sync-weeks-46)
7. [Phase 3 — Billing & POS](#phase-3--billing--pos-weeks-710)
8. [Phase 4 — Orders, Catalogue & Customer PWA](#phase-4--orders-catalogue--customer-pwa-weeks-1113)
9. [Phase 5 — Registers, Compliance & Hardening](#phase-5--registers-compliance--hardening-weeks-1416)
10. [Cross-Cutting Concerns](#10-cross-cutting-concerns)
11. [Environment Variables Reference](#11-environment-variables-reference)
12. [API Design Conventions](#12-api-design-conventions)

---

## 1. Project Overview

**Svarna** is a web-based jewellery shop management platform for Indian retail jewellers. It handles:

- Live metal rate integration (gold 24K/22K/18K, silver, platinum)
- GST-compliant invoice generation with IRN (e-invoice) registration
- HUID (Hallmark Unique ID) tracking per item per BIS registry
- Inventory management with HUID certificates
- Pre-orders, custom jobs, repair tracking
- Karigar (goldsmith) gold-issue ledger
- Daily registers, GST filing exports (GSTR-1, GSTR-3B)
- Role-based access: Owner, Counter Staff, Accountant, Customer
- Offline-tolerant POS (service worker, sync queue)
- Multi-branch ready architecture (single store for v1)

**Primary users:**
- Owner/Manager — dashboard, reports, settings, approvals
- Counter Staff — billing, inventory management, order updates
- Accountant — registers, GST exports, audit
- Customer — catalogue browsing, pre-order placement

---

## 2. Tech Stack

### Backend
| Layer | Technology |
|---|---|
| Runtime | Node.js 20 LTS |
| Framework | NestJS 10 (monorepo) |
| Language | TypeScript 5 (strict mode) |
| ORM | Prisma 5 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Real-time | Socket.IO (via `@nestjs/websockets`) |
| Job scheduling | `@nestjs/schedule` (cron) |
| Auth | JWT (access + refresh tokens), `@nestjs/passport` |
| Validation | `class-validator`, `class-transformer` |
| File storage | AWS S3 (or MinIO for local dev) |
| PDF generation | `@react-pdf/renderer` or `puppeteer` |
| Email | Nodemailer (SMTP) |
| SMS/WhatsApp | Twilio (configurable) |
| Testing | Jest + Supertest |

### Frontend
| Layer | Technology |
|---|---|
| Framework | React 18 + Vite 5 |
| Language | TypeScript 5 |
| State | Zustand (client state) + TanStack Query v5 (server state) |
| Routing | React Router v6 |
| UI Components | shadcn/ui + Tailwind CSS v3 |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| Real-time | Socket.IO client |
| PWA | Vite PWA plugin (`vite-plugin-pwa`) |
| Offline queue | `idb` (IndexedDB wrapper) |

### Infrastructure
| Concern | Tool |
|---|---|
| Containerisation | Docker + Docker Compose (dev) |
| Process manager | PM2 (production) |
| Reverse proxy | Nginx |
| CI | GitHub Actions |
| Secrets | `.env` files (dev), environment injection (prod) |

---

## 3. Repository Structure

```
svarna/
├── apps/
│   ├── api/                        # NestJS backend
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── inventory/
│   │   │   │   ├── catalogue/
│   │   │   │   ├── billing/
│   │   │   │   ├── orders/
│   │   │   │   ├── rate-sync/
│   │   │   │   ├── registers/
│   │   │   │   ├── notifications/
│   │   │   │   └── karigar/
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   ├── guards/
│   │   │   │   ├── interceptors/
│   │   │   │   ├── filters/
│   │   │   │   └── pipes/
│   │   │   ├── config/
│   │   │   └── prisma/
│   │   ├── test/
│   │   └── prisma/
│   │       ├── schema.prisma
│   │       └── migrations/
│   │
│   └── web/                        # React frontend
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── pages/
│       │   │   ├── owner/          # Owner console
│       │   │   ├── pos/            # Counter POS
│       │   │   ├── accountant/     # Registers & GST
│       │   │   └── catalogue/      # Customer-facing
│       │   ├── components/
│       │   │   ├── ui/             # shadcn primitives
│       │   │   └── shared/         # App-specific shared
│       │   ├── hooks/
│       │   ├── stores/             # Zustand stores
│       │   ├── lib/
│       │   │   ├── api.ts          # Axios instance
│       │   │   ├── socket.ts       # Socket.IO client
│       │   │   └── offline-queue.ts
│       │   └── types/
│       └── public/
│
├── packages/
│   └── shared-types/               # Shared TS interfaces (DTOs, enums)
│
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── package.json                    # Root workspace
```

---

## 4. Database Schema

All tables use UUID primary keys. All timestamps are `timestamptz` (UTC). Soft deletes use `deleted_at` nullable column where applicable.

### 4.1 Core entities

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── Enums ───────────────────────────────────────────────────────────────────

enum Role {
  OWNER
  STAFF
  ACCOUNTANT
  CUSTOMER
}

enum Metal {
  GOLD
  SILVER
  PLATINUM
}

enum Purity {
  GOLD_24K
  GOLD_22K
  GOLD_18K
  GOLD_14K
  SILVER_999
  SILVER_925
  PLATINUM_950
}

enum InvoiceStatus {
  DRAFT
  CONFIRMED
  IRN_PENDING
  IRN_REGISTERED
  CANCELLED
}

enum OrderType {
  PRE_ORDER
  CUSTOM
  REPAIR
}

enum OrderStatus {
  DRAFT
  CONFIRMED
  MAKING
  READY
  INVOICED
  CANCELLED
}

enum PaymentMode {
  CASH
  UPI
  CARD
  NET_BANKING
  CHEQUE
  OLD_GOLD_EXCHANGE
}

enum RegisterType {
  SALES
  PURCHASE
  OLD_GOLD_EXCHANGE
  KARIGAR
  KYC
  EXPENSE
}

enum KarigarEntryType {
  ISSUED
  RETURNED
}

// ─── Tables ──────────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(uuid())
  name          String
  email         String    @unique
  phone         String?
  passwordHash  String
  role          Role
  active        Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  deletedAt     DateTime?

  invoicesCreated  Invoice[]        @relation("InvoiceCreatedBy")
  ordersAssigned   Order[]          @relation("OrderAssignedTo")
  karigarEntries   KarigarLedger[]  @relation("KarigarUser")
  registerEntries  RegisterEntry[]
  auditEvents      AuditEvent[]     @relation("AuditActor")
  refreshTokens    RefreshToken[]
}

model RefreshToken {
  id        String   @id @default(uuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}

model Category {
  id        String    @id @default(uuid())
  name      String
  slug      String    @unique
  visible   Boolean   @default(true)
  sortOrder Int       @default(0)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  items Item[]
}

model Item {
  id               String    @id @default(uuid())
  categoryId       String
  sku              String    @unique
  name             String
  description      String?
  purity           Purity
  grossWeightG     Decimal   @db.Decimal(10, 3)
  netWeightG       Decimal   @db.Decimal(10, 3)
  stoneWeightG     Decimal   @db.Decimal(10, 3) @default(0)
  huid             String?   @unique
  hallmarkCertUrl  String?
  makingPct        Decimal   @db.Decimal(5, 2)  @default(0)
  makingPerGram    Decimal   @db.Decimal(10, 2) @default(0)
  stoneValue       Decimal   @db.Decimal(12, 2) @default(0)
  stockQty         Int       @default(1)
  imageUrls        String[]
  active           Boolean   @default(true)
  catalogueVisible Boolean   @default(false)
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?

  category     Category       @relation(fields: [categoryId], references: [id])
  invoiceLines InvoiceLine[]
  huidLogs     HuidLog[]
  stockMovements StockMovement[]
}

model StockMovement {
  id        String   @id @default(uuid())
  itemId    String
  type      String   // "IN" | "OUT" | "ADJUSTMENT"
  qty       Int
  reason    String?
  refId     String?  // invoice id or order id
  createdAt DateTime @default(now())

  item Item @relation(fields: [itemId], references: [id])
}

model RateSnapshot {
  id          String   @id @default(uuid())
  metal       Metal
  purity      Purity
  ratePerGram Decimal  @db.Decimal(12, 4)
  currency    String   @default("INR")
  source      String?
  snappedAt   DateTime @default(now())

  invoices Invoice[]

  @@index([metal, purity, snappedAt(sort: Desc)])
}

model Customer {
  id           String    @id @default(uuid())
  name         String
  phone        String    @unique
  email        String?
  panNumber    String?
  kycDocUrl    String?
  kycVerified  Boolean   @default(false)
  totalSpent   Decimal   @db.Decimal(14, 2) @default(0)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?

  invoices Invoice[]
  orders   Order[]
}

model Invoice {
  id                 String        @id @default(uuid())
  customerId         String
  rateSnapshotId     String
  createdById        String
  invoiceNumber      String        @unique
  subtotal           Decimal       @db.Decimal(14, 2)
  makingTotal        Decimal       @db.Decimal(14, 2) @default(0)
  wastageTotal       Decimal       @db.Decimal(14, 2) @default(0)
  stoneTotal         Decimal       @db.Decimal(14, 2) @default(0)
  oldGoldDeduction   Decimal       @db.Decimal(14, 2) @default(0)
  oldGoldWeightG     Decimal       @db.Decimal(10, 3) @default(0)
  oldGoldRatePerGram Decimal       @db.Decimal(12, 4) @default(0)
  taxableAmount      Decimal       @db.Decimal(14, 2)
  cgst               Decimal       @db.Decimal(14, 2) @default(0)
  sgst               Decimal       @db.Decimal(14, 2) @default(0)
  igst               Decimal       @db.Decimal(14, 2) @default(0)
  totalAmount        Decimal       @db.Decimal(14, 2)
  amountPaid         Decimal       @db.Decimal(14, 2) @default(0)
  balanceDue         Decimal       @db.Decimal(14, 2) @default(0)
  status             InvoiceStatus @default(DRAFT)
  irn                String?
  irnQrUrl           String?
  pdfUrl             String?
  notes              String?
  invoicedAt         DateTime?
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt

  customer      Customer      @relation(fields: [customerId], references: [id])
  rateSnapshot  RateSnapshot  @relation(fields: [rateSnapshotId], references: [id])
  createdBy     User          @relation("InvoiceCreatedBy", fields: [createdById], references: [id])
  lines         InvoiceLine[]
  payments      Payment[]
  order         Order?        @relation("OrderInvoice")
  registerEntry RegisterEntry?
}

model InvoiceLine {
  id           String  @id @default(uuid())
  invoiceId    String
  itemId       String
  qty          Int     @default(1)
  netWeightG   Decimal @db.Decimal(10, 3)
  ratePerGram  Decimal @db.Decimal(12, 4)
  makingCharge Decimal @db.Decimal(14, 2) @default(0)
  wastage      Decimal @db.Decimal(14, 2) @default(0)
  stoneValue   Decimal @db.Decimal(14, 2) @default(0)
  lineTotal    Decimal @db.Decimal(14, 2)

  invoice Invoice @relation(fields: [invoiceId], references: [id])
  item    Item    @relation(fields: [itemId], references: [id])
}

model Payment {
  id        String      @id @default(uuid())
  invoiceId String
  amount    Decimal     @db.Decimal(14, 2)
  mode      PaymentMode
  reference String?
  paidAt    DateTime    @default(now())

  invoice Invoice @relation(fields: [invoiceId], references: [id])
}

model Order {
  id              String      @id @default(uuid())
  customerId      String
  assignedToId    String?
  invoiceId       String?     @unique
  orderNumber     String      @unique
  type            OrderType
  status          OrderStatus @default(DRAFT)
  description     String?
  metalPurity     Purity?
  estimatedWeightG Decimal?   @db.Decimal(10, 3)
  estimatedValue  Decimal?    @db.Decimal(14, 2)
  advancePaid     Decimal     @db.Decimal(14, 2) @default(0)
  balanceDue      Decimal     @db.Decimal(14, 2) @default(0)
  expectedReady   DateTime?
  imageUrls       String[]
  notes           String?
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt

  customer       Customer        @relation(fields: [customerId], references: [id])
  assignedTo     User?           @relation("OrderAssignedTo", fields: [assignedToId], references: [id])
  invoice        Invoice?        @relation("OrderInvoice", fields: [invoiceId], references: [id])
  payments       OrderPayment[]
  karigarEntries KarigarLedger[]
}

model OrderPayment {
  id        String      @id @default(uuid())
  orderId   String
  amount    Decimal     @db.Decimal(14, 2)
  mode      PaymentMode
  reference String?
  paidAt    DateTime    @default(now())

  order Order @relation(fields: [orderId], references: [id])
}

model KarigarLedger {
  id            String           @id @default(uuid())
  karigarUserId String
  orderId       String?
  entryType     KarigarEntryType
  goldWeightG   Decimal          @db.Decimal(10, 3)
  metal         Metal            @default(GOLD)
  purity        Purity?
  notes         String?
  entryAt       DateTime         @default(now())

  karigar User   @relation("KarigarUser", fields: [karigarUserId], references: [id])
  order   Order? @relation(fields: [orderId], references: [id])
}

model RegisterEntry {
  id            String       @id @default(uuid())
  createdById   String
  refInvoiceId  String?      @unique
  refOrderId    String?
  registerType  RegisterType
  description   String?
  amount        Decimal      @db.Decimal(14, 2) @default(0)
  entryDate     DateTime     @default(now()) @db.Date
  createdAt     DateTime     @default(now())

  createdBy  User     @relation(fields: [createdById], references: [id])
  invoice    Invoice? @relation(fields: [refInvoiceId], references: [id])
}

model HuidLog {
  id          String   @id @default(uuid())
  itemId      String
  huid        String
  action      String   // "REGISTERED" | "VERIFIED" | "TRANSFERRED"
  bisResponse String?
  loggedAt    DateTime @default(now())

  item Item @relation(fields: [itemId], references: [id])
}

model AuditEvent {
  id          String   @id @default(uuid())
  actorId     String?
  entityType  String
  entityId    String
  action      String
  beforeState Json?
  afterState  Json?
  ipAddress   String?
  occurredAt  DateTime @default(now())

  actor User? @relation("AuditActor", fields: [actorId], references: [id])

  @@index([entityType, entityId])
  @@index([occurredAt(sort: Desc)])
}
```

### 4.2 Key constraints and rules

- `AuditEvent` — never UPDATE or DELETE rows. Enforce via application layer + DB role with no DELETE privilege on this table.
- `RateSnapshot` — immutable after creation. Once an `Invoice` references a snapshot, that rate is locked forever.
- `Invoice.status` transitions: `DRAFT → CONFIRMED → IRN_PENDING → IRN_REGISTERED`. Cancellation allowed from DRAFT or CONFIRMED only.
- `Order.status` transitions: `DRAFT → CONFIRMED → MAKING → READY → INVOICED | CANCELLED`.
- GST rule: `igst` is used for inter-state transactions; `cgst + sgst` for intra-state. Exactly one of these pairs must be non-zero on a confirmed invoice.
- Invoice number format: `SVR-YYYYMM-NNNN` (e.g. `SVR-202507-0001`). Auto-incremented per month.
- Order number format: `ORD-YYYYMMDD-NNNN`.

---

## Phase 1 — Foundation (Weeks 1–3)

### Goals
Establish the project skeleton, database, authentication, and role-based access. No business logic yet — just infrastructure every other phase depends on.

### Deliverables

#### 1.1 Project scaffold
- Initialise npm workspaces monorepo at root with `apps/api`, `apps/web`, `packages/shared-types`
- `apps/api`: NestJS 10 app with TypeScript strict mode
- `apps/web`: Vite 5 + React 18 + TypeScript app
- `packages/shared-types`: Shared enums and DTO interfaces (no runtime deps)
- Root `docker-compose.yml` with services: `postgres`, `redis`, `minio` (S3-compatible local)
- `.env.example` with all required variables (see §11)
- ESLint + Prettier config at root level

#### 1.2 Database setup
- Prisma schema with all tables from §4
- Initial migration: `prisma migrate dev --name init`
- Seed script: create one owner user, basic categories (Necklace, Ring, Bangle, Earring, Bracelet, Pendant, Chain)
- Database connection via `PrismaService` (injectable NestJS service)

#### 1.3 Auth module (`apps/api/src/modules/auth/`)
- `POST /auth/register` — owner-only route to create new users
- `POST /auth/login` — returns `{ accessToken, refreshToken, user }`
- `POST /auth/refresh` — exchange refresh token for new access token
- `POST /auth/logout` — invalidate refresh token
- `GET /auth/me` — return current user profile
- Access token: JWT, 15-minute expiry, payload `{ sub, email, role }`
- Refresh token: JWT, 7-day expiry, stored in `RefreshToken` table (hashed)
- `JwtAuthGuard` — validates access token, attaches user to request
- `RolesGuard` — checks `@Roles(Role.OWNER, Role.STAFF)` decorator
- Passwords: bcrypt with 12 rounds

#### 1.4 Common infrastructure
- Global `ValidationPipe` with `whitelist: true`, `forbidNonWhitelisted: true`
- Global `HttpExceptionFilter` — consistent error response shape:
  ```json
  { "statusCode": 400, "message": "...", "errors": [...], "timestamp": "..." }
  ```
- `AuditInterceptor` — logs every mutating request (POST/PUT/PATCH/DELETE) to `AuditEvent` table
- `PaginationDto` — `{ page, limit, sortBy, sortOrder }` base DTO for all list endpoints
- `ResponseDto<T>` wrapper: `{ data: T, meta?: PaginationMeta }`

#### 1.5 Frontend scaffold
- React Router v6 setup with route groups: `/owner/*`, `/pos/*`, `/accountant/*`, `/catalogue/*`, `/auth/*`
- Auth context + `useAuth` hook (reads JWT from `localStorage`, auto-refresh)
- `ProtectedRoute` component — redirects to login if not authenticated, checks role
- Axios instance with base URL, JWT header injection, 401 refresh interceptor
- Tailwind CSS + shadcn/ui initialised
- Login page (`/auth/login`) — phone/email + password form
- Basic shell layouts per role (sidebar nav, header with user info + logout)

#### 1.6 Tests
- Unit tests for `AuthService` (login, register, refresh)
- E2E test for auth flow (login → protected route → refresh → logout)

---

## Phase 2 — Inventory & Rate Sync (Weeks 4–6)

### Goals
Manage the jewellery stock (items + HUID) and keep live metal rates flowing into Redis with WebSocket broadcast to all connected clients.

### Deliverables

#### 2.1 Inventory module (`apps/api/src/modules/inventory/`)

**Categories**
- `GET /inventory/categories` — list all (public)
- `POST /inventory/categories` — create [OWNER]
- `PATCH /inventory/categories/:id` — update name, slug, visibility, sort order [OWNER]
- `DELETE /inventory/categories/:id` — soft delete (only if no active items) [OWNER]

**Items**
- `GET /inventory/items` — paginated list with filters: `categoryId`, `purity`, `active`, `lowStock`, `search` (name/SKU/HUID)
- `GET /inventory/items/:id` — full detail
- `POST /inventory/items` — create item [OWNER, STAFF]
  - Auto-generate SKU if not provided: `{CATEGORY_SLUG}-{YYYYMM}-{SEQ}`
  - Validate HUID format (6-digit alphanumeric) if provided
- `PATCH /inventory/items/:id` — update [OWNER, STAFF]
- `DELETE /inventory/items/:id` — soft delete (only if no active invoice lines) [OWNER]
- `POST /inventory/items/:id/images` — upload images to S3, store URLs [OWNER, STAFF]
- `DELETE /inventory/items/:id/images/:imageIndex` — remove image URL [OWNER]

**Stock movements**
- `POST /inventory/items/:id/stock` — manual stock adjustment [OWNER, STAFF]
  - Body: `{ type: "IN"|"OUT"|"ADJUSTMENT", qty, reason }`
  - Creates `StockMovement` record, updates `Item.stockQty`
- `GET /inventory/items/:id/stock-history` — paginated movement history [OWNER, STAFF]

**HUID**
- `POST /inventory/items/:id/huid` — register HUID: validate against BIS registry (mock for now, real integration later), create `HuidLog` [OWNER]
- `GET /inventory/huid-log` — full HUID audit log [OWNER, ACCOUNTANT]

**Live valuation**
- `GET /inventory/items/:id/valuation` — compute current value using latest cached rate from Redis

#### 2.2 Rate Sync module (`apps/api/src/modules/rate-sync/`)

**Rate sync service**
- Cron job every 5 minutes: `@Cron('*/5 * * * *')`
- Fetch from configurable bullion feed URL (env: `BULLION_FEED_URL`)
- Response parsing: extract gold (24K/22K/18K), silver (999/925), platinum (950) rates per gram in INR
- Write to Redis: key `rate:GOLD:GOLD_24K`, value `{ ratePerGram, snappedAt }`, TTL 10 minutes
- Insert `RateSnapshot` record (immutable — never update)
- Broadcast to Socket.IO room `rates` via event `rate:update` with payload:
  ```json
  { "metal": "GOLD", "purity": "GOLD_24K", "ratePerGram": 6450.50, "snappedAt": "..." }
  ```
- On startup: seed Redis from latest `RateSnapshot` records if cache is empty

**Fallback:** If bullion feed is unreachable, keep last Redis value and log a warning. Never leave Redis empty — use last known snapshot.

**Rate API**
- `GET /rates/current` — returns all current rates from Redis (public, no auth)
- `GET /rates/history` — paginated `RateSnapshot` history with date range filter [OWNER, ACCOUNTANT]
- `GET /rates/history/:metal/:purity` — rate history for specific metal/purity

**WebSocket gateway** (`RateGateway`)
- Namespace: `/rates`
- On connect: emit current rates from Redis immediately
- Room: `rates` — all authenticated clients auto-join
- Event emitted: `rate:update`

#### 2.3 Owner console — Inventory UI

**Pages:**
- `/owner/inventory` — item list with search, filters, low-stock badge, pagination
- `/owner/inventory/new` — create item form
- `/owner/inventory/:id` — item detail with edit, image gallery, stock history, HUID status
- `/owner/inventory/categories` — category management
- `/owner/rates` — live rate ticker (updates in real-time via Socket.IO), rate history chart (Recharts line chart, last 30 days)

**Components:**
- `<RateTicker />` — live rate display bar, persists at top of Owner/POS layouts, updates without page refresh
- `<LowStockAlert />` — badge in nav showing count of items with `stockQty <= 2`
- `<HuidBadge />` — green if HUID registered, grey if not
- `<StockMovementDrawer />` — slide-in panel for manual stock adjustment

#### 2.4 Tests
- Unit tests for `RateSyncService` (rate normalisation, Redis write)
- Unit tests for `InventoryService` (CRUD, stock movement, valuation)
- Integration test: rate cron → Redis → WebSocket broadcast

---

## Phase 3 — Billing & POS (Weeks 7–10)

### Goals
The revenue-generating core. Counter staff create bills, the pricing engine computes totals from live rates, invoices are generated as PDFs, and IRN is registered with the GST e-invoice portal.

### Deliverables

#### 3.1 Billing module (`apps/api/src/modules/billing/`)

**Pricing engine service** — pure, testable computation:
```
lineTotal =
  (netWeightG × ratePerGram)     ← metal value
  + makingCharge                  ← % of metal value OR flat per gram
  + wastage                       ← % of metal value (configurable)
  + stoneValue                    ← fixed from item

invoiceSubtotal = Σ(lineTotal)
oldGoldDeduction = oldGoldWeightG × oldGoldRatePerGram
taxableAmount = invoiceSubtotal - oldGoldDeduction
gstAmount = taxableAmount × gstRate                  ← 3% for jewellery
totalAmount = taxableAmount + gstAmount
```

Rules:
- GST rate: 3% on jewellery (CGST 1.5% + SGST 1.5% intra-state, IGST 3% inter-state). Store `IS_INTERSTATE` in env/settings.
- Making charge applied as `makingPct` of metal value if `> 0`, else `makingPerGram × netWeightG`.
- Round all monetary values to 2 decimal places (Banker's rounding).
- Rate used = latest `RateSnapshot` for that purity from Redis at the moment `POST /billing/invoices` is called. Snapshot ID is stored on the invoice — never recompute.
- Old gold exchange: `oldGoldWeightG × oldGoldRatePerGram` is deducted before GST.

**Invoice endpoints:**
- `POST /billing/invoices` — create invoice [STAFF, OWNER]
  - Atomically: compute pricing, create Invoice + InvoiceLine records, create RateSnapshot ref, decrement stock, create `StockMovement`, create `RegisterEntry`
  - If IRN auto-registration is enabled (env flag), trigger IRN registration async
  - Returns created invoice
- `GET /billing/invoices` — paginated list with filters: `customerId`, `status`, `dateRange`, `search` (invoice number) [OWNER, STAFF, ACCOUNTANT]
- `GET /billing/invoices/:id` — full detail with lines and payments
- `POST /billing/invoices/:id/payments` — record payment [STAFF, OWNER]
  - Updates `amountPaid`, recalculates `balanceDue`
- `POST /billing/invoices/:id/cancel` — cancel invoice [OWNER only]
  - Reverses stock movements, marks invoice cancelled, voids IRN if registered
- `GET /billing/invoices/:id/pdf` — generate and return PDF (or S3 signed URL if cached) [all roles]
- `POST /billing/invoices/:id/irn` — manually trigger IRN registration [OWNER, ACCOUNTANT]
- `POST /billing/invoices/:id/send` — send SMS/WhatsApp receipt to customer [STAFF, OWNER]

**Pricing preview endpoint:**
- `POST /billing/preview` — compute bill total without saving [STAFF, OWNER]
  - Body: `{ items: [{ itemId, qty, netWeightG? }], oldGoldWeightG?, oldGoldRatePerGram?, customerId? }`
  - Returns full computed breakdown — used by POS for live bill preview

**IRN service (`IrnService`):**
- Integrates with NIC's IRP sandbox (`https://einvoice1-uat.nic.in`)
- Signs invoice JSON per GST e-invoice schema v1.1
- Stores `irn`, `ackNo`, `ackDate`, `signedQrCode` on Invoice
- Retry with exponential backoff (max 3 retries)
- On failure: set `status = IRN_PENDING`, surface error to owner dashboard
- PDF service: embed IRN QR code in invoice PDF

**PDF service (`PdfService`):**
- Template: A4 portrait, shop letterhead (name, address, GSTIN from env), customer details, itemised lines with weight/purity/making breakdown, GST breakup, IRN + QR code, digital signature placeholder
- Generate on demand, cache to S3 for 30 days
- Use `puppeteer` with a React-rendered HTML template

**Customer endpoint (billing context):**
- `GET /billing/customers` — search by name/phone [STAFF, OWNER]
- `POST /billing/customers` — quick-create customer at POS [STAFF, OWNER]
- `GET /billing/customers/:id/history` — purchase history + outstanding dues

#### 3.2 Counter POS UI (`apps/web/src/pages/pos/`)

**Page: `/pos`** — the main billing screen
- Left panel: item search (by name, SKU, HUID, or barcode scan via keyboard wedge)
- Bill builder: running list of items added, each row showing weight, making, line total
- Live rate shown at top — updates via Socket.IO
- Old gold exchange section: enter weight + rate
- Customer selector: search existing or quick-add new
- GST mode toggle: intra-state / inter-state
- Bill summary: subtotal, making, wastage, stone, old gold deduction, GST, total
- Payment section: select mode (cash/UPI/card), enter amount, change calculation
- "Generate bill" button → calls `POST /billing/invoices` → shows success with invoice number
- "Preview PDF" button → opens PDF in new tab
- "Send receipt" button → SMS/WhatsApp to customer

**Page: `/pos/invoices`** — invoice history and reprint

**Component: `<BillPreview />`**
- Real-time — recalculates on every item add/remove/qty change using `POST /billing/preview`
- Debounced 300ms to avoid hammering API

**Offline behaviour:**
- If API is unreachable, queue invoice creation in IndexedDB (`offline-queue.ts`)
- Show "Offline — bill will sync when reconnected" banner
- On reconnect, drain queue in order, show sync result notification

#### 3.3 Tests
- Unit tests: `PricingEngine` — test all combinations (with/without old gold, with/without stone, intra/inter-state GST)
- Unit tests: `IrnService` — mock IRP responses, test retry logic
- E2E: full POS flow (add items → preview → create invoice → PDF → payment)
- E2E: IRN registration flow (mock IRP sandbox)

---

## Phase 4 — Orders, Catalogue & Customer PWA (Weeks 11–13)

### Goals
Pre-orders, custom jewellery jobs, repair tracking, a goldsmith ledger, and the customer-facing catalogue as an installable PWA.

### Deliverables

#### 4.1 Orders module (`apps/api/src/modules/orders/`)

**Order endpoints:**
- `POST /orders` — create order [STAFF, OWNER]
  - Body: `{ customerId, type, description, metalPurity?, estimatedWeightG?, expectedReady, assignedToId? }`
  - Auto-generate order number
- `GET /orders` — paginated list with filters: `status`, `type`, `customerId`, `assignedToId`, `dueSoon` (expected ready in next 3 days) [OWNER, STAFF]
- `GET /orders/:id` — full detail with payments and karigar entries
- `PATCH /orders/:id` — update details / reassign [OWNER, STAFF]
- `PATCH /orders/:id/status` — transition status [OWNER, STAFF]
  - Validate allowed transitions
  - On `INVOICED`: require `invoiceId` in body — links the completed invoice
  - On `READY`: auto-send WhatsApp/SMS notification to customer
- `POST /orders/:id/payments` — record advance or part-payment [STAFF, OWNER]
  - Updates `advancePaid`, recalculates `balanceDue`
- `DELETE /orders/:id` — cancel (DRAFT/CONFIRMED only) [OWNER]

**Karigar ledger endpoints:**
- `POST /orders/:id/karigar` — log gold issue or return [OWNER, STAFF]
  - Body: `{ karigarUserId, entryType, goldWeightG, metal, purity?, notes }`
- `GET /karigar/balance` — running balance per karigar (sum issued − sum returned) [OWNER]
- `GET /karigar/ledger` — full paginated ledger with date range filter [OWNER, ACCOUNTANT]

#### 4.2 Catalogue module (`apps/api/src/modules/catalogue/`)

**Public endpoints (no auth required):**
- `GET /catalogue/items` — live-priced catalogue with filters: `categoryId`, `purity`, `search`
  - Each item's `indicativePrice` computed from current Redis rate on the fly
  - Only items where `catalogueVisible = true` are returned
- `GET /catalogue/items/:id` — item detail with live price
- `GET /catalogue/categories` — visible categories

**Customer auth:**
- `POST /catalogue/auth/register` — customer self-registration (phone + OTP, or email + password)
- `POST /catalogue/auth/login`
- `POST /catalogue/reserve` — authenticated customer reserves an item [CUSTOMER]
  - Creates an `Order` with `type = PRE_ORDER`, `status = CONFIRMED`
  - Body: `{ itemId, notes, expectedDate? }`
  - Triggers notification to owner dashboard
- `GET /catalogue/my-orders` — customer's own orders and their status [CUSTOMER]

#### 4.3 Customer catalogue PWA (`apps/web/src/pages/catalogue/`)

**Pages:**
- `/catalogue` — home with category tiles and featured items
- `/catalogue/items` — grid/list view with filters
- `/catalogue/items/:id` — item detail with image gallery, live price ticker, "Reserve" button
- `/catalogue/auth/login` — customer login
- `/catalogue/my-orders` — order status tracker

**PWA config (`vite-plugin-pwa`):**
- Manifest: name "Svarna Jewels", theme colour gold (`#B8860B`), icons
- Service worker: cache catalogue assets (images, static files) with stale-while-revalidate
- Offline page when no cached content available

**Live price on catalogue:**
- Connect to `/rates` Socket.IO namespace
- Update displayed prices in real-time without page reload
- Debounce visual update to 1 second to avoid flicker

#### 4.4 Owner/Staff order management UI

**Pages:**
- `/owner/orders` — order list with kanban-style status columns (or table view toggle)
- `/owner/orders/:id` — order detail: status timeline, karigar gold log, payment history, customer contact
- `/pos/orders/new` — quick order creation from POS
- `/owner/karigar` — karigar balance sheet + ledger

**Components:**
- `<OrderStatusBadge />` — colour-coded by status
- `<KarigarBalanceCard />` — shows outstanding gold per karigar
- `<OrderPaymentDrawer />` — record advance payment

#### 4.5 Tests
- Unit tests: `OrderService` — status transitions, invalid transition rejection
- Unit tests: `CatalogueService` — live price computation
- E2E: customer pre-order flow (browse → reserve → owner notified)
- E2E: karigar gold issue → return → balance check

---

## Phase 5 — Registers, Compliance & Hardening (Weeks 14–16)

### Goals
Accountant-facing daily registers, GST export files, HUID log report, audit trail UI, offline POS hardening, and production readiness.

### Deliverables

#### 5.1 Registers module (`apps/api/src/modules/registers/`)

**Register endpoints:**
- `GET /registers/sales` — daily sales register: all invoices for a date, totals per payment mode [OWNER, ACCOUNTANT]
- `GET /registers/purchases` — purchase entries for a date range [OWNER, ACCOUNTANT]
- `GET /registers/old-gold` — old gold exchange entries [OWNER, ACCOUNTANT]
- `GET /registers/karigar` — karigar ledger report [OWNER, ACCOUNTANT]
- `GET /registers/huid-log` — HUID registration/verification log [OWNER, ACCOUNTANT]
- `GET /registers/audit` — audit event trail with filters: `entityType`, `actorId`, `dateRange` [OWNER]

**GST exports:**
- `GET /registers/gst/gstr1?from=&to=` — GSTR-1 data in JSON format (B2B, B2C, HSN summary) [ACCOUNTANT]
- `GET /registers/gst/gstr1/download` — GSTR-1 as Excel/CSV download [ACCOUNTANT]
- `GET /registers/gst/gstr3b?month=&year=` — GSTR-3B summary table [ACCOUNTANT]

**Stock audit:**
- `GET /registers/stock-audit` — current stock with last movement date and live valuation

**KYC register:**
- `GET /registers/kyc` — all customers with PAN + KYC doc status [OWNER, ACCOUNTANT]

#### 5.2 Accountant UI (`apps/web/src/pages/accountant/`)

**Pages:**
- `/accountant/dashboard` — summary: today's sales, GST payable estimate, outstanding dues total
- `/accountant/registers/sales` — date picker + sales table with totals
- `/accountant/registers/gst` — GST period selector, GSTR-1 / GSTR-3B preview, download buttons
- `/accountant/registers/huid` — HUID log table
- `/accountant/registers/stock` — stock audit table with live valuation totals
- `/accountant/audit` — audit event trail with search and filters

**Components:**
- `<GstSummaryCard />` — taxable amount, CGST, SGST, IGST for selected period
- `<DateRangePicker />` — shared component used across all register pages
- `<DownloadButton />` — triggers CSV/Excel download with loading state

#### 5.3 Owner dashboard (`/owner/dashboard`)
- Today's sales total (invoiced amount)
- Outstanding dues (sum of `balanceDue` across all unpaid invoices)
- Pending orders count by status
- Low-stock items list
- Live rate ticker (all metals)
- IRN failures panel — invoices with `status = IRN_PENDING`, with retry button
- Recent activity feed (last 20 audit events)

#### 5.4 Offline POS hardening

**Service worker (`apps/web/src/sw.ts`):**
- Intercept `POST /billing/invoices` — if offline, write to IndexedDB queue with full request payload
- Intercept `GET /rates/current` — serve from cache (last known rates)
- Intercept `GET /inventory/items` — serve from cache (stale-while-revalidate, 1 hour)
- Background sync on reconnect: drain IndexedDB queue in FIFO order, retry failed requests
- Show persistent "Offline" banner; show "Syncing N bills…" during drain

**Conflict handling:**
- If an item was sold by another terminal while offline, reject with `409 Conflict` and show specific error
- Stock conflicts show item name and ask staff to verify stock before retrying

#### 5.5 Notifications service (`apps/api/src/modules/notifications/`)

**Events that trigger notifications:**
| Event | Recipient | Channel |
|---|---|---|
| Invoice created | Customer | SMS + WhatsApp |
| Order status → READY | Customer | WhatsApp |
| Order advance payment received | Owner | In-app |
| Low stock (qty ≤ 2) | Owner | In-app + Email |
| IRN registration failure | Owner | In-app + Email |
| New pre-order from catalogue | Owner/Staff | In-app |

**Implementation:**
- `NotificationService` with methods: `sendSms(phone, message)`, `sendWhatsApp(phone, message)`, `sendEmail(to, subject, body)`
- Twilio for SMS + WhatsApp (configurable via env)
- Queue-based: write to Redis queue, worker processes async — never block invoice creation
- In-app notifications: `GET /notifications` returns unread count + last 20; `PATCH /notifications/:id/read`
- Socket.IO event `notification:new` pushed to owner/staff on new in-app notification

#### 5.6 Settings module (`apps/api/src/modules/settings/`)

**Shop settings (owner only):**
- `GET /settings` — return all settings
- `PATCH /settings` — update: shop name, address, GSTIN, state code, logo URL, IRN auto-registration toggle, GST type (intra/interstate), bullion feed URL, making charge defaults, wastage defaults

Settings stored in a simple `Setting` key-value table (not in Prisma schema above — add it):
```prisma
model Setting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}
```

#### 5.7 Production hardening

**Security:**
- Helmet.js middleware (HTTP security headers)
- CORS configured with allowlist of frontend origins
- Rate limiting: 100 req/min per IP globally, 10 req/min on auth endpoints
- Input sanitisation on all string fields
- S3 signed URLs (15-minute expiry) for PDF and image access — never public URLs
- PII vault concept: `Customer.panNumber` and `Customer.kycDocUrl` encrypted at rest using AES-256 (Node `crypto` module, key from env)

**Observability:**
- Structured JSON logging via `winston` (log level configurable via env)
- Request logging interceptor: method, path, status, duration, userId
- Health check endpoint: `GET /health` — checks DB, Redis, S3 connectivity
- Error tracking: integrate Sentry (DSN from env, optional)

**Backup:**
- Document PostgreSQL backup procedure: `pg_dump` via cron, upload to S3
- Redis: `BGSAVE` on schedule for RDB persistence

**Performance:**
- Prisma query optimisation: add `@@index` on hot query paths
- Redis caching for `GET /catalogue/items` (5-minute TTL, invalidate on item update)
- Image optimisation: resize uploaded item images to max 1200px on upload via `sharp`

#### 5.8 Tests
- Unit tests: `PricingEngine` edge cases (zero weight, zero making, all GST types)
- Unit tests: GST export formatters (GSTR-1 B2B, B2C, HSN sections)
- E2E: full order lifecycle (create → making → ready → invoice → payment)
- E2E: offline queue drain (simulate network drop, create bill, reconnect, verify sync)
- Load test: 50 concurrent POS billing requests (k6 or Artillery)

---

## 10. Cross-Cutting Concerns

### 10.1 Audit trail
Every create/update/delete on financial entities (Invoice, Payment, Order, OrderPayment, Item, StockMovement, KarigarLedger) must produce an `AuditEvent` record. Use the `AuditInterceptor` for API-level logging and Prisma middleware for model-level logging of before/after states.

### 10.2 Decimal precision
- All weights: 3 decimal places (`Decimal(10,3)`)
- All rates: 4 decimal places (`Decimal(12,4)`)
- All money amounts: 2 decimal places (`Decimal(14,2)`)
- Never use JavaScript `number` for monetary calculations — use the `Decimal.js` library throughout the pricing engine

### 10.3 Timezone handling
- All database timestamps stored in UTC
- All API responses return UTC ISO strings
- Frontend converts to `Asia/Kolkata` (IST) for display using `date-fns-tz`
- Date-only fields (register entry date, expected ready date) stored as `DATE` type, interpreted in IST

### 10.4 File uploads
- Max file size: 10MB for images, 25MB for KYC documents
- Allowed image types: JPEG, PNG, WebP
- Allowed KYC types: PDF, JPEG, PNG
- Files uploaded to S3 with path: `{env}/{entity}/{id}/{filename}`
- Item images resized to 1200px max dimension via `sharp` before upload

### 10.5 Multi-branch readiness
While v1 is single-store, design with multi-branch in mind:
- Add `branchId` column to `Item`, `Invoice`, `Order`, `RegisterEntry` (nullable in v1, will be required in v2)
- All list queries scoped by `branchId` when not null
- `User` has `branchId` (nullable = all branches access)

---

## 11. Environment Variables Reference

```bash
# App
NODE_ENV=development
PORT=3000
FRONTEND_URL=http://localhost:5173

# Database
DATABASE_URL=postgresql://svarna:svarna@localhost:5432/svarna

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# S3 / MinIO
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=svarna
S3_REGION=ap-south-1

# Bullion feed
BULLION_FEED_URL=https://your-bullion-api.com/rates
BULLION_FEED_API_KEY=

# GST / IRN
GSTIN=22AAAAA0000A1Z5
GST_STATE_CODE=22
IS_INTERSTATE=false
IRP_BASE_URL=https://einvoice1-uat.nic.in
IRP_USERNAME=
IRP_PASSWORD=

# Notifications
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@svarnajewels.com

# Encryption (KYC PII vault)
PII_ENCRYPTION_KEY=32-byte-hex-key-change-in-prod

# Sentry (optional)
SENTRY_DSN=

# Shop
SHOP_NAME=Svarna Jewels
SHOP_ADDRESS=
SHOP_PHONE=
SHOP_LOGO_URL=
```

---

## 12. API Design Conventions

### Base URL
`/api/v1`

### Response envelope
```json
{
  "data": { ... },
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### Error response
```json
{
  "statusCode": 422,
  "message": "Validation failed",
  "errors": [
    { "field": "netWeightG", "message": "must be a positive number" }
  ],
  "timestamp": "2026-06-25T10:30:00.000Z",
  "path": "/api/v1/billing/invoices"
}
```

### Pagination query params
`?page=1&limit=20&sortBy=createdAt&sortOrder=desc`

### Date range filters
`?from=2026-06-01&to=2026-06-30` (ISO date, IST interpreted)

### Soft delete behaviour
- `GET` list endpoints exclude soft-deleted records by default
- `GET` single endpoint returns 404 for soft-deleted records
- Add `?includeDeleted=true` for admin/audit queries [OWNER only]

### HTTP methods
- `POST` — create
- `GET` — read
- `PATCH` — partial update (always partial — never `PUT`)
- `DELETE` — soft delete (hard delete only for non-financial entities)

---

*Document version: 1.0 — 25 June 2026*
*Generated from Svarna HLD v1.0*
