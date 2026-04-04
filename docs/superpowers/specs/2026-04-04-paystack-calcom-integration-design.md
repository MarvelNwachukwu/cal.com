# Paystack Payment Integration for Cal.com

## Overview

A Cal.com app-store payment plugin that adds Paystack as a first-class payment provider. The package lives at `packages/app-store/paystack/` inside the Cal.com instance, implements `IAbstractPaymentService`, and plugs directly into Cal.com's existing booking + payment lifecycle. No standalone service, no database migrations — all Paystack-specific data fits into Cal.com's existing JSON columns.

### Goals

- Enable paid event types using Paystack (NGN, GHS, ZAR, KES, USD)
- Inline popup checkout via `@paystack/inline-js` for seamless UX
- Full refund support through Paystack's refund API
- Follow Cal.com's existing patterns (mirror Stripe's app-store structure)

### Non-Goals

- HOLD payment mode (Paystack doesn't support card-hold-then-charge)
- Flutterwave / NowPayments integration (future separate packages)
- OAuth-based setup (Paystack uses API key pairs)
- Modifications to Cal.com's core booking logic

### Target Users

Primarily Africa-based Cal.com users who need NGN and other African currency payment collection for bookings.

---

## Architecture

### How It Fits Into Cal.com

The Paystack package integrates into Cal.com's existing payment lifecycle. Steps 1-3 and 7 are existing Cal.com code, untouched. We only build steps 4-6.

```
1. Booker fills form & submits
2. RegularBookingService creates Booking (paid: false)
3. handlePayment() loads PaymentServiceMap["paystack"]
   ↓ calls create()
4. PaymentService.create()
   → POST /transaction/initialize to Paystack
   → Stores access_code + reference in Payment.data
   → Creates Payment record (success: false)
   ↓ returns paymentUid
5. Payment Page Component
   → Loads @paystack/inline-js
   → resumeTransaction(accessCode) — popup appears
   → Booker pays in popup
6. Webhook endpoint
   → Verifies x-paystack-signature (HMAC SHA-512)
   → Looks up Payment by reference (externalId)
   → Re-verifies with Paystack GET /transaction/verify/{reference}
   → Calls handlePaymentSuccess()
   ↓
7. CONFIRMED — Booking.paid = true, calendar events created, emails sent
```

### Auto-Discovery

Cal.com's build tool (`packages/app-store-cli/src/build.ts`) scans for `lib/PaymentService.ts` in each app directory. The presence of this file automatically registers the app in `PaymentServiceMap` — no manual registration needed.

---

## Package Structure

```
packages/app-store/paystack/
  _metadata.ts              # slug: "paystack", category: "payment", variant: "payment"
  config.json               # App display info (name, description, logo, category)
  index.ts                  # Re-exports api, lib, metadata
  zod.ts                    # appDataSchema + appKeysSchema
  package.json              # Dependencies: @paystack/inline-js

  api/
    webhook.ts              # Paystack charge.success webhook handler
    verify.ts               # Client-initiated verification endpoint (backup)

  lib/
    PaymentService.ts       # Implements IAbstractPaymentService
    PaystackClient.ts       # Thin REST wrapper around Paystack API
    currencyOptions.ts      # NGN, GHS, ZAR, KES, USD

  components/
    PaystackPaymentComponent.tsx    # Payment page — inline popup checkout
    EventTypeAppCardInterface.tsx   # Card in event type settings
    EventTypeAppSettingsInterface.tsx # Price/currency/refund policy form

  pages/
    setup/index.tsx         # Setup wizard — collect public + secret key

  static/
    icon.svg                # Paystack logo
```

---

## PaymentService Implementation

### IAbstractPaymentService Method Mapping

| Method | Implementation |
|--------|---------------|
| `create(amount, currency, bookingId, ...)` | Calls Paystack `POST /transaction/initialize`. Stores `access_code`, `authorization_url`, `publicKey`, and `reference` in `Payment.data`. Sets `Payment.externalId` to the Paystack reference. |
| `refund(paymentId)` | Reads `Payment.externalId` (reference). Calls Paystack `POST /refund`. Updates `Payment.refunded = true`. |
| `update(paymentId, data)` | Updates `Payment.data` JSON with latest state. |
| `collectCard()` | Stub — throws "Paystack does not support card hold". |
| `chargeCard()` | Stub — throws "Paystack does not support card hold". |
| `afterPayment()` | No-op — resolves immediately. |
| `deletePayment(paymentId)` | Deletes Payment record from DB. Uninitiated Paystack transactions expire on their own. |
| `isSetupAlready()` | Returns `true` if credentials contain both `publicKey` and `secretKey`. |
| `getPaymentPaidStatus()` | Calls Paystack `GET /transaction/verify/{reference}` and returns the status. |
| `getPaymentDetails()` | Returns the Payment record from DB. |

### Factory Function

```typescript
export function BuildPaymentService(
  credentials: { key: Prisma.JsonValue }
): IAbstractPaymentService {
  return new PaystackPaymentService(credentials);
}
```

### PaystackClient.ts

Thin REST wrapper using `fetch`. No external SDK dependency beyond `@paystack/inline-js` (frontend only).

```typescript
class PaystackClient {
  constructor(private secretKey: string) {}

  async initializeTransaction(params: {
    email: string;
    amount: number;
    currency: string;
    reference: string;
    callback_url: string;
    metadata?: Record<string, any>;
  }): Promise<{ access_code: string; authorization_url: string; reference: string }>

  async verifyTransaction(reference: string): Promise<{
    status: string; // "success" | "failed" | "abandoned"
    amount: number;
    currency: string;
  }>

  async createRefund(params: {
    transaction: string; // reference
    amount?: number;     // partial refund (optional)
  }): Promise<{ status: string }>
}
```

All requests authenticated with `Authorization: Bearer {secretKey}`. Base URL: `https://api.paystack.co`.

### Amount Handling

Cal.com stores amounts in the smallest currency unit (cents/kobo). Paystack also expects amounts in the smallest unit (kobo for NGN, pesewas for GHS, cents for ZAR/USD). No conversion needed — amounts pass through directly.

### Reference Generation

Each payment gets a deterministic reference: `cal_{bookingId}_{shortUuid}`. This ensures:
- Uniqueness across transactions
- Easy mapping from Paystack webhooks back to Cal.com bookings
- Idempotency — the same booking won't create duplicate Paystack transactions

---

## Zod Schemas

### appKeysSchema — Credential Storage

```typescript
export const appKeysSchema = z.object({
  publicKey: z.string().min(1),
  secretKey: z.string().min(1),
});
```

Stored in `Credential.key` (JSON column). Validated during setup.

### appDataSchema — Event Type Configuration

```typescript
export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: z.literal("ON_BOOKING"),
    enabled: z.boolean().optional(),
    credentialId: z.number().optional(),
    refundPolicy: z.nativeEnum(RefundPolicy).optional(),
    refundDaysCount: z.number().optional(),
    refundCountCalendarDays: z.boolean().optional(),
  })
);
```

Stored in `eventType.metadata.apps.paystack`. The `paymentOption` is locked to `"ON_BOOKING"` since Paystack doesn't support the HOLD pattern.

### Payment.data — Per-Transaction Data

```typescript
{
  access_code: string;        // For resumeTransaction() popup
  authorization_url: string;  // Fallback redirect URL
  publicKey: string;          // Frontend needs this to init @paystack/inline-js
  reference: string;          // Paystack transaction reference
}
```

Stored in the existing `Payment.data` JSON column.

### No Database Migration

All Paystack-specific data fits into existing columns: `Credential.key` (JSON), `eventType.metadata` (JSON), and `Payment.data` (JSON). The `Payment` model's existing fields (`uid`, `externalId`, `amount`, `currency`, `success`, `refunded`, `data`, `appId`) cover everything needed.

---

## Webhook Endpoint

### Route

`POST /api/integrations/paystack/webhook`

### Flow

1. **Extract raw body** — disable body parsing (needed for signature verification)
2. **Parse body to get reference** — extract `data.reference` from the JSON payload (before signature verification, since we need the reference to find the credential)
3. **Look up Payment and credential** — find Payment by `externalId` matching the reference, then traverse `Payment → Booking → EventType → metadata.apps.paystack.credentialId → Credential` to get the secret key
4. **Verify signature** — compute `HMAC SHA-512(rawBody, secretKey)`, compare with `x-paystack-signature` header using `crypto.timingSafeEqual()` (constant-time comparison to prevent timing attacks). If verification fails, return 401.
5. **Handle `charge.success`** only — ignore other event types with 200 response
6. **Idempotency check** — if `Payment.success` is already `true`, return 200 immediately
7. **Re-verify with Paystack** — `GET /transaction/verify/{reference}` to confirm payment status independently
8. **Confirm booking** — call `handlePaymentSuccess({ paymentId, bookingId, appSlug: "paystack", traceContext })`

### Credential Lookup Order

The webhook needs the secret key to verify the signature, but it needs to parse the body first to get the reference. The order is:
1. Parse body to get `data.reference` (untrusted at this point)
2. Find Payment by `externalId` matching the reference
3. Traverse `Payment → Booking → EventType → metadata.apps.paystack.credentialId → Credential`
4. Use the Credential's secret key to verify the HMAC signature
5. Only after signature verification passes do we trust the payload and proceed

This is safe because: the lookup is read-only (no state changes before verification), and if the reference doesn't match any Payment, we return early before any processing.

---

## Verify Endpoint (Backup)

### Route

`GET /api/integrations/paystack/verify?reference={reference}`

### Purpose

Backup confirmation path when the webhook is delayed. The payment page component calls this endpoint after the Paystack popup's `onSuccess` callback fires.

### Flow

1. Look up Payment by `externalId` matching the reference
2. If `Payment.success` is already `true`, return success immediately
3. Load the credential (same lookup chain as webhook)
4. Call Paystack `GET /transaction/verify/{reference}`
5. If status is `"success"`, call `handlePaymentSuccess()`
6. Return the result to the frontend

---

## Payment Page Component

### PaystackPaymentComponent.tsx

Rendered at `/payment/{uid}` when the Payment record's `appId` is `"paystack"`.

### Behavior

1. Receives the Payment record (including `data` JSON) as props from Cal.com's payment page
2. Extracts `access_code` and `publicKey` from `Payment.data`
3. Renders booking summary: event title, amount (formatted with currency), host name
4. Renders a "Pay with Paystack" button
5. On button click:
   - Instantiates `PaystackPop` from `@paystack/inline-js`
   - Calls `popup.resumeTransaction(accessCode)`
   - Paystack popup overlay appears over the page
6. On popup `onSuccess`:
   - Shows success message
   - Calls verify endpoint as backup: `/api/integrations/paystack/verify?reference={reference}`
   - Redirects to booking confirmation page
7. On popup `onCancel`:
   - Shows "Payment cancelled" message
   - Button remains clickable for retry (access_code is reusable)

---

## Setup & Configuration

### App Installation

1. Admin navigates to Settings → Apps → Payment
2. Finds "Paystack" → clicks Install
3. Setup page collects Public Key and Secret Key (from Paystack dashboard)
4. Keys validated against `appKeysSchema` and saved to `Credential` table
5. Setup page displays the webhook URL for the admin to copy into their Paystack dashboard:
   `https://{cal-domain}/api/integrations/paystack/webhook`

No OAuth flow needed — Paystack uses simple API key pairs.

### Event Type Configuration

Once installed, admin enables Paystack on any event type via the Apps tab:

- **Price** — display amount (e.g., 5000 for NGN 5,000; stored as 500000 kobo internally)
- **Currency** — dropdown: NGN, GHS, ZAR, KES, USD
- **Payment option** — locked to "On Booking" (HOLD option hidden)
- **Refund policy** — Cal.com's existing settings: Never, Days Before Event, Calendar Days
- **Refund days count** — number of days for the refund window

Configuration stored in `eventType.metadata.apps.paystack`.

### Supported Currencies

```typescript
export const currencyOptions = [
  { label: "NGN — Nigerian Naira", value: "ngn" },
  { label: "GHS — Ghanaian Cedi", value: "ghs" },
  { label: "ZAR — South African Rand", value: "zar" },
  { label: "KES — Kenyan Shilling", value: "kes" },
  { label: "USD — US Dollar", value: "usd" },
];
```

---

## Error Handling

| Failure Mode | Behavior | Recovery |
|---|---|---|
| Paystack API down during `create()` | `create()` throws, Cal.com shows error to booker | Booker retries booking. Unpaid booking expires via Cal.com cleanup. |
| Booker pays but webhook fails | Paystack retries webhooks (up to 3 attempts) | Popup `onSuccess` triggers client-side verify endpoint as backup. |
| Booker closes popup without paying | Booking stays `paid: false` | "Pay with Paystack" button remains clickable (same `access_code` reusable). Cal.com sends "awaiting payment" reminder. |
| Duplicate webhook received | Handler checks `Payment.success` first | If already `true`, returns 200 immediately. Idempotent by design. |
| Invalid webhook signature | HMAC comparison fails, returns 401 | Logged for monitoring. Uses `crypto.timingSafeEqual()`. |
| Refund fails on Paystack | `refund()` throws, Cal.com shows error to admin | Admin retries or processes refund manually via Paystack dashboard. |

---

## Testing Strategy

### Unit Tests

- **PaystackClient**: correct params sent, response parsing, error handling
- **Webhook signature verification**: valid passes, tampered body fails, missing header fails, timing-safe comparison used
- **PaymentService methods**: `create()` stores correct Payment data, `refund()` updates `Payment.refunded`, idempotent webhook handling, stubs throw for unsupported methods

### Integration / E2E Tests

Using Paystack's test mode (`sk_test_` / `pk_test_` keys):

- **Full booking flow**: Create event type with Paystack → Book → Payment page appears → Complete payment (test card) → Verify booking confirmed → Calendar event created
- **Refund flow**: Complete paid booking → Cancel within refund window → Verify refund processed → `Payment.refunded = true`
- **Webhook testing**: Paystack fires webhooks in test mode, so the full lifecycle is testable end-to-end

### Test Cards

Paystack provides test card numbers on the checkout page in test mode. No real money is moved.

---

## Dependencies

### Runtime

- `@paystack/inline-js` — frontend popup SDK (loaded on payment page only)
- No server-side SDK — uses native `fetch` to call Paystack REST API

### Dev/Build

- No new build dependencies
- Cal.com's existing `app-store-cli` handles auto-discovery and code generation

---

## Future Extensions

Each would be its own app-store package following this same pattern:

- **Flutterwave** (`packages/app-store/flutterwave/`) — similar init/verify flow, 30+ currencies, inline popup available
- **NowPayments** (`packages/app-store/nowpayments/`) — crypto payments, redirect-only (no popup), 300+ cryptocurrencies
- **Paystack HOLD mode** — if Paystack adds authorization-hold support in the future, `collectCard()` and `chargeCard()` can be implemented

Cal.com enforces one payment app per event type, so admins choose which provider to use for each event type.
