import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  timestamp,
  date,
  time,
  jsonb,
  index,
  primaryKey,
} from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------

export const categories = pgTable('categories', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const menuItems = pgTable('menu_items', {
  id: serial('id').primaryKey(),
  categoryId: integer('category_id')
    .notNull()
    .references(() => categories.id),
  nameEn: text('name_en').notNull(),
  nameZh: text('name_zh'),
  description: text('description'),
  basePriceCents: integer('base_price_cents').notNull(),
  imageUrl: text('image_url'),
  imageAlt: text('image_alt'),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  tags: text('tags').array().notNull().default([]),
});

export const modifierGroups = pgTable('modifier_groups', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  minSelect: integer('min_select').notNull().default(0),
  maxSelect: integer('max_select').notNull().default(1),
  required: boolean('required').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const modifiers = pgTable('modifiers', {
  id: serial('id').primaryKey(),
  groupId: integer('group_id')
    .notNull()
    .references(() => modifierGroups.id),
  name: text('name').notNull(),
  // Either a delta on the base price, or a full override (Pint/Quart pricing).
  priceDeltaCents: integer('price_delta_cents').notNull().default(0),
  priceOverrideCents: integer('price_override_cents'),
  isAvailable: boolean('is_available').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});

export const itemModifierGroups = pgTable(
  'item_modifier_groups',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id),
    groupId: integer('group_id')
      .notNull()
      .references(() => modifierGroups.id),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.groupId] })]
);

// ---------------------------------------------------------------------------
// Orders — full lifecycle (Addendum B1). Snapshotted, never joined to live menu.
// ---------------------------------------------------------------------------

export const orderStatus = pgEnum('order_status', [
  'new', //         submitted, kitchen not yet acknowledged
  'acknowledged', // kitchen tapped Accept -> customer gets confirmation SMS
  'ready', //       kitchen tapped Ready
  'picked_up', //   handed to the customer
  'rejected', //    kitchen declined -> customer gets "please call us" SMS
  'canceled', //    customer called to cancel; staff canceled it
  'no_show', //     never picked up -> feeds the phone blocklist
]);

export const orders = pgTable('orders', {
  id: serial('id').primaryKey(),
  orderNumber: text('order_number').notNull(),
  customerName: text('customer_name').notNull(),
  customerPhone: text('customer_phone').notNull(),
  fulfillmentType: text('fulfillment_type').notNull().default('pickup'),
  pickupAt: timestamp('pickup_at', { withTimezone: true }).notNull(),
  status: orderStatus('status').notNull().default('new'),
  subtotalCents: integer('subtotal_cents').notNull(),
  taxCents: integer('tax_cents').notNull(),
  totalCents: integer('total_cents').notNull(),
  notes: text('notes'),
  idempotencyKey: text('idempotency_key').notNull().unique(),
  smsOptIn: boolean('sms_opt_in').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  // These timestamps drive escalation and post-mortems (plan §7.3).
  notifiedAt: timestamp('notified_at', { withTimezone: true }),
  acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
  readyAt: timestamp('ready_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  escalationLevel: integer('escalation_level').notNull().default(0),
});

export const orderItems = pgTable('order_items', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id')
    .notNull()
    .references(() => orders.id),
  menuItemId: integer('menu_item_id').notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  qty: integer('qty').notNull(),
  unitPriceCents: integer('unit_price_cents').notNull(),
  notes: text('notes'),
});

export const orderItemModifiers = pgTable('order_item_modifiers', {
  id: serial('id').primaryKey(),
  orderItemId: integer('order_item_id')
    .notNull()
    .references(() => orderItems.id),
  modifierId: integer('modifier_id').notNull(),
  nameSnapshot: text('name_snapshot').notNull(),
  priceDeltaCents: integer('price_delta_cents').notNull().default(0),
});

// ---------------------------------------------------------------------------
// Order submissions — the analytics spine.
//
// Orders are phoned in, not fulfilled through the app, so this table is not an
// order queue: it is the record of what customers actually built, so the owner
// can see demand without waiting for anyone to type it into a POS. One row per
// "Confirm order" tap, with the lines snapshotted and enough context (device,
// hour, whether the shop was open) to slice later.
//
// It holds no personal information: no name, no phone, no email, no IP.
// `sessionId` is a random id minted in the browser purely to tell repeat
// builders from new ones.
// ---------------------------------------------------------------------------

/** One built line: what it was, how many, what it cost at the time. */
export interface SubmissionLine {
  itemId: number;
  name: string;
  categoryName: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  modifiers: { id: number; name: string; priceDeltaCents: number }[];
  note: string | null;
}

export const orderSubmissions = pgTable(
  'order_submissions',
  {
    id: serial('id').primaryKey(),
    /** Short human-readable code the customer can quote on the phone. */
    reference: text('reference').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    // --- money (re-priced on the server; the client total is never trusted)
    subtotalCents: integer('subtotal_cents').notNull(),
    taxCents: integer('tax_cents').notNull(),
    totalCents: integer('total_cents').notNull(),
    taxRateBps: integer('tax_rate_bps').notNull(),

    // --- shape of the basket
    itemCount: integer('item_count').notNull(), // sum of quantities
    lineCount: integer('line_count').notNull(), // distinct lines
    lines: jsonb('lines').$type<SubmissionLine[]>().notNull(),

    // --- context, for slicing
    /** Store's local hour 0–23 and weekday 0–6 at submission, precomputed so
     *  reporting never has to redo timezone maths. */
    localHour: integer('local_hour').notNull(),
    localWeekday: integer('local_weekday').notNull(),
    storeOpen: boolean('store_open').notNull(),
    closedReason: text('closed_reason'),
    /** Seconds between first item added and confirming. */
    buildSeconds: integer('build_seconds'),
    device: text('device'), // mobile | tablet | desktop
    viewportWidth: integer('viewport_width'),
    userAgent: text('user_agent'),
    referrer: text('referrer'),
    sessionId: text('session_id'),

    // --- outcome: did building an order actually turn into a phone call?
    calledAt: timestamp('called_at', { withTimezone: true }),
    copiedAt: timestamp('copied_at', { withTimezone: true }),
  },
  (t) => [index('order_submissions_created_at_idx').on(t.createdAt)]
);

// ---------------------------------------------------------------------------
// Store configuration
// ---------------------------------------------------------------------------

export const storeSettings = pgTable('store_settings', {
  id: integer('id').primaryKey().default(1), // singleton row
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  timezone: text('timezone').notNull().default('America/New_York'),
  taxRateBps: integer('tax_rate_bps').notNull().default(800), // 8.00%
  prepTimeMinutes: integer('prep_time_minutes').notNull().default(15),
  orderingPaused: boolean('ordering_paused').notNull().default(false),
  // Kitchen-screen heartbeat (plan §7.3 layer 5 / Addendum B3)
  kitchenLastSeenAt: timestamp('kitchen_last_seen_at', { withTimezone: true }),
  heartbeatAlertedAt: timestamp('heartbeat_alerted_at', { withTimezone: true }),
});

// Multiple rows per weekday models split lunch/dinner service properly.
export const businessHours = pgTable('business_hours', {
  id: serial('id').primaryKey(),
  dayOfWeek: integer('day_of_week').notNull(), // 0 = Sunday ... 6 = Saturday
  openTime: time('open_time').notNull(), //     local wall-clock in store tz
  closeTime: time('close_time').notNull(),
  lastOrderOffsetMinutes: integer('last_order_offset_minutes').notNull().default(20),
});

export const closures = pgTable('closures', {
  id: serial('id').primaryKey(),
  date: date('date').notNull(),
  reason: text('reason'),
  allDay: boolean('all_day').notNull().default(true),
  openTime: time('open_time'),
  closeTime: time('close_time'),
});

// ---------------------------------------------------------------------------
// Fraud / abuse (Addendum A4+B1: no-show blocklist is now capturable)
// ---------------------------------------------------------------------------

export const blockedPhones = pgTable('blocked_phones', {
  phone: text('phone').primaryKey(),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Observability (plan §7.3 layer 9): every notification attempt is logged.
// A silent Twilio failure must not look like a quiet night.
// ---------------------------------------------------------------------------

export const notificationLog = pgTable('notification_log', {
  id: serial('id').primaryKey(),
  orderId: integer('order_id'),
  channel: text('channel').notNull(), // sms | email | console
  target: text('target').notNull(),
  kind: text('kind').notNull(), // new_order | escalation_1 | escalation_2 | customer_confirm | customer_reject | customer_ready | heartbeat | inbound_forward
  status: text('status').notNull(), // sent | failed | logged
  providerResponse: text('provider_response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Auth: one owner account (seeded — no public signup route exists at all),
// plus server-side sessions. Kitchen devices auth via KITCHEN_TOKEN cookie
// (Addendum B2 — /kitchen shows customer PII and must not be public).
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: text('username').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  token: text('token').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
