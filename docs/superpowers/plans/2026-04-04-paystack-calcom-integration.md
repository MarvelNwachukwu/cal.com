# Paystack Cal.com Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Paystack payment app-store package to Cal.com that enables paid event types with inline popup checkout, webhook-driven confirmation, and refund support.

**Architecture:** The package lives at `packages/app-store/paystack/` inside a Cal.com instance. It implements `IAbstractPaymentService` and plugs into Cal.com's existing booking + payment lifecycle — no core modifications needed. The build tool auto-discovers the package via `lib/PaymentService.ts`.

**Tech Stack:** TypeScript, Next.js (Cal.com framework), Zod validation, Prisma ORM, `@paystack/inline-js` (frontend popup SDK), Paystack REST API (server-side via `fetch`), Vitest (testing).

**Spec:** `docs/superpowers/specs/2026-04-04-paystack-calcom-integration-design.md`

**Pre-requisite:** A local Cal.com development instance. Clone `calcom/cal.com` and follow their setup guide. All file paths below are relative to the Cal.com repo root.

---

### Task 1: Package Scaffold — config.json, _metadata.ts, index.ts, package.json

**Files:**
- Create: `packages/app-store/paystack/config.json`
- Create: `packages/app-store/paystack/_metadata.ts`
- Create: `packages/app-store/paystack/index.ts`
- Create: `packages/app-store/paystack/package.json`

- [ ] **Step 1: Create config.json**

```json
{
  "/*": "Don't modify slug - If required, do it using cli edit command",
  "name": "Paystack",
  "slug": "paystack",
  "type": "paystack_payment",
  "logo": "icon.svg",
  "url": "https://paystack.com",
  "variant": "payment",
  "categories": ["payment"],
  "publisher": "Cal.com",
  "email": "support@cal.com",
  "description": "Accept payments via Paystack for your Cal.com bookings",
  "extendsFeature": "EventType",
  "isTemplate": false,
  "__createdUsingCli": true,
  "imageSrc": "icon.svg",
  "__template": "event-type-app-card",
  "dirName": "paystack",
  "isOAuth": false
}
```

- [ ] **Step 2: Create index.ts**

```typescript
export * as api from "./api";
export * as lib from "./lib";
```

- [ ] **Step 3: Create package.json**

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "private": true,
  "name": "@calcom/paystack",
  "version": "0.0.0",
  "main": "./index.ts",
  "dependencies": {
    "@calcom/lib": "workspace:*",
    "@paystack/inline-js": "^2.0.0"
  },
  "devDependencies": {
    "@calcom/types": "workspace:*"
  },
  "description": "Paystack payment integration for Cal.com"
}
```

- [ ] **Step 4: Create _metadata.ts**

```typescript
import type { AppMeta } from "@calcom/types/App";

import _package from "./package.json";

export const metadata = {
  name: "Paystack",
  description: _package.description,
  installed: true,
  type: "paystack_payment",
  variant: "payment",
  logo: "icon.svg",
  publisher: "Cal.com",
  url: "https://paystack.com",
  categories: ["payment"],
  slug: "paystack",
  title: "Paystack",
  email: "support@cal.com",
  dirName: "paystack",
  isOAuth: false,
} as AppMeta;

export default metadata;
```

- [ ] **Step 6: Add Paystack logo**

Download the Paystack logo SVG and save to `packages/app-store/paystack/static/icon.svg`. A placeholder works for now:

```bash
mkdir -p packages/app-store/paystack/static
# Download from Paystack's brand assets or use a placeholder
echo '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#00C3F7"><rect width="24" height="4" y="2" rx="1"/><rect width="18" height="4" y="10" rx="1"/><rect width="12" height="4" y="18" rx="1"/></svg>' > packages/app-store/paystack/static/icon.svg
```

- [ ] **Step 7: Commit**

```bash
git add packages/app-store/paystack/config.json packages/app-store/paystack/_metadata.ts packages/app-store/paystack/index.ts packages/app-store/paystack/package.json packages/app-store/paystack/static/icon.svg
git commit -m "feat(paystack): scaffold package with config, metadata, index, and package.json"
```

---

### Task 2: Zod Schemas — appDataSchema, appKeysSchema

**Files:**
- Create: `packages/app-store/paystack/zod.ts`

- [ ] **Step 1: Create zod.ts**

```typescript
import { z } from "zod";

import { eventTypeAppCardZod } from "@calcom/app-store/eventTypeAppCardZod";
import { RefundPolicy } from "@calcom/lib/payment/types";

const paymentOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
});

export const paymentOptionsSchema = z.array(paymentOptionSchema);

export const PaystackPaymentOptions = [
  {
    label: "on_booking_option",
    value: "ON_BOOKING",
  },
];

type PaymentOption = (typeof PaystackPaymentOptions)[number]["value"];
const VALUES: [PaymentOption, ...PaymentOption[]] = [
  PaystackPaymentOptions[0].value,
  ...PaystackPaymentOptions.slice(1).map((option) => option.value),
];
export const paymentOptionEnum = z.enum(VALUES);

export const appDataSchema = eventTypeAppCardZod.merge(
  z.object({
    price: z.number(),
    currency: z.string(),
    paymentOption: z.string().optional(),
    enabled: z.boolean().optional(),
    refundPolicy: z.nativeEnum(RefundPolicy).optional(),
    refundDaysCount: z.number().optional(),
    refundCountCalendarDays: z.boolean().optional(),
  })
);

export const appKeysSchema = z.object({
  public_key: z.string().min(1),
  secret_key: z.string().min(1),
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-store/paystack/zod.ts
git commit -m "feat(paystack): add zod schemas for app data and app keys"
```

---

### Task 3: Currency Options

**Files:**
- Create: `packages/app-store/paystack/lib/currencyOptions.ts`

- [ ] **Step 1: Create currencyOptions.ts**

```typescript
export const currencyOptions = [
  { label: "Nigerian naira (NGN)", value: "ngn" },
  { label: "Ghanaian cedi (GHS)", value: "ghs" },
  { label: "South African rand (ZAR)", value: "zar" },
  { label: "Kenyan shilling (KES)", value: "kes" },
  { label: "United States dollar (USD)", value: "usd" },
];

export const currencySymbols: Record<string, string> = {
  ngn: "₦",
  ghs: "GH₵",
  zar: "R",
  kes: "KSh",
  usd: "$",
};

export const isAcceptedCurrencyCode = (code: string): code is keyof typeof currencySymbols => {
  return code in currencySymbols;
};
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-store/paystack/lib/currencyOptions.ts
git commit -m "feat(paystack): add currency options for Paystack-supported currencies"
```

---

### Task 4: PaystackClient — REST API Wrapper

**Files:**
- Create: `packages/app-store/paystack/lib/PaystackClient.ts`
- Create: `packages/app-store/paystack/lib/__tests__/PaystackClient.test.ts`

- [ ] **Step 1: Write failing tests for PaystackClient**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

import { PaystackClient } from "../PaystackClient";

describe("PaystackClient", () => {
  let client: PaystackClient;

  beforeEach(() => {
    client = new PaystackClient("sk_test_xxxxx");
  });

  describe("initializeTransaction", () => {
    it("sends correct params and returns parsed response", async () => {
      const mockResponse = {
        status: true,
        message: "Authorization URL created",
        data: {
          authorization_url: "https://checkout.paystack.com/abc123",
          access_code: "abc123",
          reference: "cal_42_ref123",
        },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await client.initializeTransaction({
        email: "test@example.com",
        amount: 500000,
        currency: "NGN",
        reference: "cal_42_ref123",
        callback_url: "https://cal.com/payment/callback",
        metadata: { bookingId: 42 },
      });

      expect(fetch).toHaveBeenCalledWith("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk_test_xxxxx",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@example.com",
          amount: 500000,
          currency: "NGN",
          reference: "cal_42_ref123",
          callback_url: "https://cal.com/payment/callback",
          metadata: { bookingId: 42 },
        }),
      });

      expect(result).toEqual({
        authorization_url: "https://checkout.paystack.com/abc123",
        access_code: "abc123",
        reference: "cal_42_ref123",
      });
    });

    it("throws on API error response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ status: false, message: "Invalid amount" }),
        })
      );

      await expect(
        client.initializeTransaction({
          email: "test@example.com",
          amount: 0,
          currency: "NGN",
          reference: "cal_42_ref123",
          callback_url: "https://cal.com/payment/callback",
        })
      ).rejects.toThrow("Paystack API error: Invalid amount");
    });
  });

  describe("verifyTransaction", () => {
    it("returns parsed verification result", async () => {
      const mockResponse = {
        status: true,
        data: {
          status: "success",
          amount: 500000,
          currency: "NGN",
          reference: "cal_42_ref123",
          paid_at: "2026-04-04T12:00:00.000Z",
        },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await client.verifyTransaction("cal_42_ref123");

      expect(fetch).toHaveBeenCalledWith(
        "https://api.paystack.co/transaction/verify/cal_42_ref123",
        {
          method: "GET",
          headers: {
            Authorization: "Bearer sk_test_xxxxx",
          },
        }
      );

      expect(result).toEqual({
        status: "success",
        amount: 500000,
        currency: "NGN",
        reference: "cal_42_ref123",
        paid_at: "2026-04-04T12:00:00.000Z",
      });
    });
  });

  describe("createRefund", () => {
    it("sends refund request with transaction reference", async () => {
      const mockResponse = {
        status: true,
        data: {
          status: "pending",
          transaction: { reference: "cal_42_ref123" },
        },
      };

      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        })
      );

      const result = await client.createRefund({ transaction: "cal_42_ref123" });

      expect(fetch).toHaveBeenCalledWith("https://api.paystack.co/refund", {
        method: "POST",
        headers: {
          Authorization: "Bearer sk_test_xxxxx",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transaction: "cal_42_ref123" }),
      });

      expect(result.status).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/app-store/paystack && npx vitest run lib/__tests__/PaystackClient.test.ts`
Expected: FAIL — `PaystackClient` module not found.

- [ ] **Step 3: Implement PaystackClient**

```typescript
const PAYSTACK_BASE_URL = "https://api.paystack.co";

export class PaystackClient {
  private secretKey: string;

  constructor(secretKey: string) {
    this.secretKey = secretKey;
  }

  async initializeTransaction(params: {
    email: string;
    amount: number;
    currency: string;
    reference: string;
    callback_url: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    authorization_url: string;
    access_code: string;
    reference: string;
  }> {
    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const json = await response.json();

    if (!response.ok || !json.status) {
      throw new Error(`Paystack API error: ${json.message || "Unknown error"}`);
    }

    return json.data;
  }

  async verifyTransaction(reference: string): Promise<{
    status: string;
    amount: number;
    currency: string;
    reference: string;
    paid_at: string | null;
  }> {
    const response = await fetch(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
      },
    });

    const json = await response.json();

    if (!response.ok || !json.status) {
      throw new Error(`Paystack API error: ${json.message || "Unknown error"}`);
    }

    return json.data;
  }

  async createRefund(params: {
    transaction: string;
    amount?: number;
  }): Promise<{ status: boolean; data: unknown }> {
    const response = await fetch(`${PAYSTACK_BASE_URL}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    const json = await response.json();

    if (!response.ok || !json.status) {
      throw new Error(`Paystack API error: ${json.message || "Unknown error"}`);
    }

    return json;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app-store/paystack && npx vitest run lib/__tests__/PaystackClient.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-store/paystack/lib/PaystackClient.ts packages/app-store/paystack/lib/__tests__/PaystackClient.test.ts
git commit -m "feat(paystack): add PaystackClient REST API wrapper with tests"
```

---

### Task 5: PaymentService — Implements IAbstractPaymentService

**Files:**
- Create: `packages/app-store/paystack/lib/PaymentService.ts`

- [ ] **Step 1: Implement PaymentService**

```typescript
import { v4 as uuidv4 } from "uuid";

import prisma from "@calcom/prisma";
import type { Booking, Payment, Prisma, PaymentOption } from "@calcom/prisma/client";
import type { CalendarEvent } from "@calcom/types/Calendar";
import type { IAbstractPaymentService } from "@calcom/types/PaymentService";

import { PaystackClient } from "./PaystackClient";

class PaystackPaymentService implements IAbstractPaymentService {
  private client: PaystackClient;
  private credentials: { public_key: string; secret_key: string };

  constructor(credentials: { key: Prisma.JsonValue }) {
    const parsed = credentials.key as { public_key: string; secret_key: string };
    this.credentials = parsed;
    this.client = new PaystackClient(parsed.secret_key);
  }

  async create(
    payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    bookingId: Booking["id"],
    _userId: Booking["userId"],
    _username: string | null,
    _bookerName: string | null,
    _paymentOption: PaymentOption,
    bookerEmail: string,
    _bookerPhoneNumber?: string | null,
    eventTitle?: string,
    _bookingTitle?: string
  ): Promise<Payment> {
    const booking = await prisma.booking.findUnique({
      select: { uid: true, title: true },
      where: { id: bookingId },
    });

    if (!booking) {
      throw new Error("Booking not found");
    }

    const uid = uuidv4();
    const reference = `cal_${bookingId}_${uid.slice(0, 8)}`;

    const paystackResponse = await this.client.initializeTransaction({
      email: bookerEmail,
      amount: payment.amount,
      currency: payment.currency.toUpperCase(),
      reference,
      callback_url: `${process.env.NEXT_PUBLIC_WEBAPP_URL}/api/integrations/paystack/callback`,
      metadata: {
        bookingId,
        eventTitle: eventTitle || booking.title,
      },
    });

    const paymentData = await prisma.payment.create({
      data: {
        uid,
        app: {
          connect: {
            slug: "paystack",
          },
        },
        booking: {
          connect: {
            id: bookingId,
          },
        },
        amount: payment.amount,
        externalId: reference,
        currency: payment.currency,
        data: {
          access_code: paystackResponse.access_code,
          authorization_url: paystackResponse.authorization_url,
          publicKey: this.credentials.public_key,
          reference,
        } as unknown as Prisma.InputJsonValue,
        fee: 0,
        refunded: false,
        success: false,
        paymentOption: "ON_BOOKING",
      },
    });

    return paymentData;
  }

  async collectCard(
    _payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    _bookingId: Booking["id"],
    _paymentOption: PaymentOption,
    _bookerEmail: string,
    _bookerPhoneNumber?: string | null
  ): Promise<Payment> {
    throw new Error("Paystack does not support card hold. Only ON_BOOKING payment is available.");
  }

  async chargeCard(
    _payment: Pick<Prisma.PaymentUncheckedCreateInput, "amount" | "currency">,
    _bookingId?: Booking["id"]
  ): Promise<Payment> {
    throw new Error("Paystack does not support card hold. Only ON_BOOKING payment is available.");
  }

  async update(
    paymentId: Payment["id"],
    data: Partial<Prisma.PaymentUncheckedCreateInput>
  ): Promise<Payment> {
    return await prisma.payment.update({
      where: { id: paymentId },
      data,
    });
  }

  async refund(paymentId: Payment["id"]): Promise<Payment | null> {
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      return null;
    }

    await this.client.createRefund({
      transaction: payment.externalId,
    });

    return await prisma.payment.update({
      where: { id: paymentId },
      data: { refunded: true },
    });
  }

  async getPaymentPaidStatus(): Promise<string> {
    return "not_implemented";
  }

  async getPaymentDetails(): Promise<Payment> {
    throw new Error("Method not implemented.");
  }

  async afterPayment(
    _event: CalendarEvent,
    _booking: {
      user: { email: string | null; name: string | null; timeZone: string } | null;
      id: number;
      startTime: { toISOString: () => string };
      uid: string;
    },
    _paymentData: Payment
  ): Promise<void> {
    // No post-payment actions needed for Paystack
    return Promise.resolve();
  }

  async deletePayment(paymentId: Payment["id"]): Promise<boolean> {
    try {
      await prisma.payment.delete({
        where: { id: paymentId },
      });
      return true;
    } catch {
      return false;
    }
  }

  isSetupAlready(): boolean {
    return !!(this.credentials.public_key && this.credentials.secret_key);
  }
}

/**
 * Factory function that creates a Paystack Payment service instance.
 * Exported instead of the class to prevent internal types from leaking
 * into the emitted .d.ts file.
 */
export function BuildPaymentService(credentials: { key: Prisma.JsonValue }): IAbstractPaymentService {
  return new PaystackPaymentService(credentials);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-store/paystack/lib/PaymentService.ts
git commit -m "feat(paystack): implement PaymentService with IAbstractPaymentService"
```

---

### Task 6: Webhook Signature Verification Utility

**Files:**
- Create: `packages/app-store/paystack/lib/verifyWebhookSignature.ts`
- Create: `packages/app-store/paystack/lib/__tests__/verifyWebhookSignature.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
import crypto from "crypto";

import { describe, it, expect } from "vitest";

import { verifyWebhookSignature } from "../verifyWebhookSignature";

describe("verifyWebhookSignature", () => {
  const secretKey = "sk_test_secretkey123";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "ref123" } });
  const validSignature = crypto.createHmac("sha512", secretKey).update(body).digest("hex");

  it("returns true for valid signature", () => {
    expect(verifyWebhookSignature(body, validSignature, secretKey)).toBe(true);
  });

  it("returns false for tampered body", () => {
    const tamperedBody = JSON.stringify({ event: "charge.success", data: { reference: "TAMPERED" } });
    expect(verifyWebhookSignature(tamperedBody, validSignature, secretKey)).toBe(false);
  });

  it("returns false for wrong secret key", () => {
    expect(verifyWebhookSignature(body, validSignature, "wrong_secret")).toBe(false);
  });

  it("returns false for empty signature", () => {
    expect(verifyWebhookSignature(body, "", secretKey)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/app-store/paystack && npx vitest run lib/__tests__/verifyWebhookSignature.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement verifyWebhookSignature**

```typescript
import crypto from "crypto";

export function verifyWebhookSignature(body: string, signature: string, secretKey: string): boolean {
  if (!signature) return false;

  const hash = crypto.createHmac("sha512", secretKey).update(body).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/app-store/paystack && npx vitest run lib/__tests__/verifyWebhookSignature.test.ts`
Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app-store/paystack/lib/verifyWebhookSignature.ts packages/app-store/paystack/lib/__tests__/verifyWebhookSignature.test.ts
git commit -m "feat(paystack): add webhook signature verification with timing-safe comparison"
```

---

### Task 7: Webhook API Endpoint

**Files:**
- Create: `packages/app-store/paystack/api/webhook.ts`

- [ ] **Step 1: Create webhook.ts**

```typescript
import { buffer } from "micro";
import type { NextApiRequest, NextApiResponse } from "next";

import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { IS_PRODUCTION } from "@calcom/lib/constants";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { safeStringify } from "@calcom/lib/safeStringify";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";

import { appKeysSchema } from "../zod";
import { PaystackClient } from "../lib/PaystackClient";
import { verifyWebhookSignature } from "../lib/verifyWebhookSignature";

const log = logger.getSubLogger({ prefix: ["[paystackWebhook]"] });

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      throw new HttpCode({ statusCode: 405, message: "Method Not Allowed" });
    }

    const requestBuffer = await buffer(req);
    const bodyString = requestBuffer.toString();

    // Parse body to get the reference (needed to find the credential for signature verification)
    let parsedBody: { event: string; data: { reference: string } };
    try {
      parsedBody = JSON.parse(bodyString);
    } catch {
      throw new HttpCode({ statusCode: 400, message: "Invalid JSON body" });
    }

    if (!parsedBody?.data?.reference) {
      throw new HttpCode({ statusCode: 400, message: "Missing reference in payload" });
    }

    const reference = parsedBody.data.reference;

    // Look up payment by reference to find the credential
    const payment = await prisma.payment.findFirst({
      where: { externalId: reference },
      select: {
        id: true,
        bookingId: true,
        success: true,
        booking: {
          select: {
            eventType: {
              select: {
                metadata: true,
              },
            },
            userId: true,
          },
        },
      },
    });

    if (!payment?.bookingId) {
      log.error("Payment not found for reference", { reference });
      throw new HttpCode({ statusCode: 204, message: "Payment not found" });
    }

    // Find the credential to verify the signature
    const metadata = payment.booking?.eventType?.metadata as Record<string, unknown> | null;
    const paystackAppData = (metadata?.apps as Record<string, unknown> | undefined)?.paystack as
      | { credentialId?: number }
      | undefined;

    const credentialQuery = paystackAppData?.credentialId
      ? { id: paystackAppData.credentialId }
      : { userId: payment.booking?.userId, appId: "paystack" as const };

    const credential = await prisma.credential.findFirst({
      where: credentialQuery,
      select: { key: true },
    });

    if (!credential) {
      log.error("Paystack credentials not found");
      throw new HttpCode({ statusCode: 500, message: "Missing payment credentials" });
    }

    const parsedKeys = appKeysSchema.safeParse(credential.key);
    if (!parsedKeys.success) {
      throw new HttpCode({ statusCode: 500, message: "Malformed credentials" });
    }

    // Verify webhook signature
    const signature = req.headers["x-paystack-signature"] as string | undefined;
    if (!signature || !verifyWebhookSignature(bodyString, signature, parsedKeys.data.secret_key)) {
      log.error("Invalid Paystack webhook signature");
      throw new HttpCode({ statusCode: 401, message: "Invalid signature" });
    }

    // Only handle charge.success events
    if (parsedBody.event !== "charge.success") {
      res.status(200).json({ message: `Unhandled event type: ${parsedBody.event}` });
      return;
    }

    // Idempotency: if already successful, skip
    if (payment.success) {
      res.status(200).json({ message: "Payment already processed" });
      return;
    }

    // Re-verify with Paystack API (belt and suspenders)
    const client = new PaystackClient(parsedKeys.data.secret_key);
    const verification = await client.verifyTransaction(reference);

    if (verification.status !== "success") {
      log.error("Paystack verification failed", { reference, status: verification.status });
      throw new HttpCode({ statusCode: 400, message: "Payment verification failed" });
    }

    // Confirm the booking
    const traceContext = distributedTracing.createTrace("paystack_webhook", {
      meta: { reference, bookingId: payment.bookingId },
    });

    await handlePaymentSuccess({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      appSlug: "paystack",
      traceContext,
    });
  } catch (_err) {
    const err = getServerErrorFromUnknown(_err);
    log.error(`Webhook Error: ${err.message}`, safeStringify(err));
    res.status(err.statusCode).send({
      message: err.message,
      stack: IS_PRODUCTION ? undefined : err.cause?.stack,
    });
    return;
  }

  res.status(200).json({ received: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-store/paystack/api/webhook.ts
git commit -m "feat(paystack): add webhook endpoint with signature verification"
```

---

### Task 8: Verify API Endpoint & API Index

**Files:**
- Create: `packages/app-store/paystack/api/verify.ts`
- Create: `packages/app-store/paystack/api/index.ts`

- [ ] **Step 1: Create verify.ts**

```typescript
import type { NextApiRequest, NextApiResponse } from "next";

import { handlePaymentSuccess } from "@calcom/app-store/_utils/payments/handlePaymentSuccess";
import { HttpError as HttpCode } from "@calcom/lib/http-error";
import logger from "@calcom/lib/logger";
import { getServerErrorFromUnknown } from "@calcom/lib/server/getServerErrorFromUnknown";
import { distributedTracing } from "@calcom/lib/tracing/factory";
import prisma from "@calcom/prisma";

import { appKeysSchema } from "../zod";
import { PaystackClient } from "../lib/PaystackClient";

const log = logger.getSubLogger({ prefix: ["[paystackVerify]"] });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "GET") {
      throw new HttpCode({ statusCode: 405, message: "Method Not Allowed" });
    }

    const reference = req.query.reference as string;
    if (!reference) {
      throw new HttpCode({ statusCode: 400, message: "Missing reference parameter" });
    }

    const payment = await prisma.payment.findFirst({
      where: { externalId: reference },
      select: {
        id: true,
        bookingId: true,
        success: true,
        booking: {
          select: {
            eventType: {
              select: { metadata: true },
            },
            userId: true,
          },
        },
      },
    });

    if (!payment?.bookingId) {
      throw new HttpCode({ statusCode: 404, message: "Payment not found" });
    }

    // Already processed
    if (payment.success) {
      res.status(200).json({ status: "success", message: "Payment already confirmed" });
      return;
    }

    // Find credential
    const metadata = payment.booking?.eventType?.metadata as Record<string, unknown> | null;
    const paystackAppData = (metadata?.apps as Record<string, unknown> | undefined)?.paystack as
      | { credentialId?: number }
      | undefined;

    const credentialQuery = paystackAppData?.credentialId
      ? { id: paystackAppData.credentialId }
      : { userId: payment.booking?.userId, appId: "paystack" as const };

    const credential = await prisma.credential.findFirst({
      where: credentialQuery,
      select: { key: true },
    });

    if (!credential) {
      throw new HttpCode({ statusCode: 500, message: "Missing payment credentials" });
    }

    const parsedKeys = appKeysSchema.safeParse(credential.key);
    if (!parsedKeys.success) {
      throw new HttpCode({ statusCode: 500, message: "Malformed credentials" });
    }

    // Verify with Paystack
    const client = new PaystackClient(parsedKeys.data.secret_key);
    const verification = await client.verifyTransaction(reference);

    if (verification.status !== "success") {
      res.status(200).json({ status: verification.status, message: "Payment not yet successful" });
      return;
    }

    // Confirm booking
    const traceContext = distributedTracing.createTrace("paystack_verify", {
      meta: { reference, bookingId: payment.bookingId },
    });

    await handlePaymentSuccess({
      paymentId: payment.id,
      bookingId: payment.bookingId,
      appSlug: "paystack",
      traceContext,
    });

    res.status(200).json({ status: "success", message: "Payment confirmed" });
  } catch (_err) {
    const err = getServerErrorFromUnknown(_err);
    log.error(`Verify Error: ${err.message}`);
    res.status(err.statusCode).json({ message: err.message });
  }
}
```

- [ ] **Step 2: Create api/index.ts**

```typescript
export { default as webhook } from "./webhook";
export { default as verify } from "./verify";
```

- [ ] **Step 3: Commit**

```bash
git add packages/app-store/paystack/api/verify.ts packages/app-store/paystack/api/index.ts
git commit -m "feat(paystack): add verify endpoint and API index"
```

---

### Task 9: EventType UI Components

**Files:**
- Create: `packages/app-store/paystack/components/EventTypeAppCardInterface.tsx`
- Create: `packages/app-store/paystack/components/EventTypeAppSettingsInterface.tsx`

- [ ] **Step 1: Create EventTypeAppCardInterface.tsx**

```tsx
import { usePathname, useSearchParams } from "next/navigation";
import { useState, useMemo } from "react";

import { useAppContextWithSchema } from "@calcom/app-store/EventTypeAppContext";
import AppCard from "@calcom/app-store/_components/AppCard";
import type { EventTypeAppCardComponent } from "@calcom/app-store/types";
import { WEBAPP_URL } from "@calcom/lib/constants";
import { useLocale } from "@calcom/lib/hooks/useLocale";

import checkForMultiplePaymentApps from "../../_utils/payments/checkForMultiplePaymentApps";
import type { appDataSchema } from "../zod";
import EventTypeAppSettingsInterface from "./EventTypeAppSettingsInterface";

const EventTypeAppCard: EventTypeAppCardComponent = function EventTypeAppCard({
  app,
  eventType,
  eventTypeFormMetadata,
  onAppInstallSuccess,
}) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const asPath = useMemo(
    () => `${pathname}${searchParams ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams]
  );
  const { getAppData, setAppData, disabled } = useAppContextWithSchema<typeof appDataSchema>();
  const [requirePayment, setRequirePayment] = useState(getAppData("enabled"));
  const otherPaymentAppEnabled = checkForMultiplePaymentApps(eventTypeFormMetadata);
  const { t } = useLocale();

  const shouldDisableSwitch = !requirePayment && otherPaymentAppEnabled;

  return (
    <AppCard
      onAppInstallSuccess={onAppInstallSuccess}
      returnTo={WEBAPP_URL + asPath}
      app={app}
      switchChecked={requirePayment}
      switchOnClick={(enabled) => {
        setRequirePayment(enabled);
      }}
      description={<>Accept payments via Paystack for your events</>}
      disableSwitch={shouldDisableSwitch}
      switchTooltip={shouldDisableSwitch ? t("other_payment_app_enabled") : undefined}>
      <>
        <EventTypeAppSettingsInterface
          eventType={eventType}
          slug={app.slug}
          disabled={disabled}
          getAppData={getAppData}
          setAppData={setAppData}
        />
      </>
    </AppCard>
  );
};

export default EventTypeAppCard;
```

- [ ] **Step 2: Create EventTypeAppSettingsInterface.tsx**

```tsx
import * as RadioGroup from "@radix-ui/react-radio-group";
import { useState, useEffect } from "react";

import type { EventTypeAppSettingsComponent } from "@calcom/app-store/types";
import {
  convertToSmallestCurrencyUnit,
  convertFromSmallestToPresentableCurrencyUnit,
} from "@calcom/lib/currencyConversions";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { RefundPolicy } from "@calcom/lib/payment/types";
import classNames from "@calcom/ui/classNames";
import { Alert } from "@calcom/ui/components/alert";
import { Select } from "@calcom/ui/components/form";
import { TextField } from "@calcom/ui/components/form";
import { RadioField } from "@calcom/ui/components/radio";

import { currencyOptions, currencySymbols, isAcceptedCurrencyCode } from "../lib/currencyOptions";

type Option = { value: string; label: string };

const EventTypeAppSettingsInterface: EventTypeAppSettingsComponent = ({
  getAppData,
  setAppData,
  disabled,
  eventType,
}) => {
  const price = getAppData("price");
  const currency = getAppData("currency") || currencyOptions[0].value;
  const [selectedCurrency, setSelectedCurrency] = useState(
    currencyOptions.find((c) => c.value === currency) || {
      label: currencyOptions[0].label,
      value: currencyOptions[0].value,
    }
  );
  const requirePayment = getAppData("enabled");

  const { t } = useLocale();
  const recurringEventDefined = eventType.recurringEvent?.count !== undefined;

  const getCurrencySymbol = (curr: string) =>
    isAcceptedCurrencyCode(curr) ? currencySymbols[curr] : "";

  useEffect(() => {
    if (requirePayment) {
      if (!getAppData("currency")) {
        setAppData("currency", currencyOptions[0].value);
      }
      if (!getAppData("paymentOption")) {
        setAppData("paymentOption", "ON_BOOKING");
      }
    }
    if (!getAppData("refundPolicy")) {
      setAppData("refundPolicy", RefundPolicy.NEVER);
    }
  }, [requirePayment, getAppData, setAppData]);

  const dayTypeOptions = [
    { value: 0, label: t("business_days") },
    { value: 1, label: t("calendar_days") },
  ];

  const getSelectedDayType = () =>
    dayTypeOptions.find((opt) => opt.value === (getAppData("refundCountCalendarDays") === true ? 1 : 0));

  return (
    <>
      {recurringEventDefined && (
        <Alert className="mt-2" severity="warning" title={t("warning_recurring_event_payment")} />
      )}
      {!recurringEventDefined && requirePayment && (
        <>
          <div className="mt-4 block items-center justify-start sm:flex sm:space-x-2">
            <TextField
              data-testid="paystack-price-input"
              label={t("price")}
              className="h-[38px]"
              addOnLeading={<>{getCurrencySymbol(selectedCurrency.value)}</>}
              addOnSuffix={currency.toUpperCase()}
              addOnClassname="h-[38px]"
              step="0.01"
              min="0.5"
              type="number"
              required
              placeholder="Price"
              disabled={disabled}
              onChange={(e) => {
                setAppData("price", convertToSmallestCurrencyUnit(Number(e.target.value), currency));
              }}
              value={price > 0 ? convertFromSmallestToPresentableCurrencyUnit(price, currency) : undefined}
            />
          </div>
          <div className="mt-5 w-60">
            <label className="text-default mb-1 block text-sm font-medium" htmlFor="currency">
              {t("currency")}
            </label>
            <Select
              data-testid="paystack-currency-select"
              variant="default"
              options={currencyOptions}
              value={selectedCurrency}
              className="text-black"
              defaultValue={selectedCurrency}
              onChange={(e) => {
                if (e) {
                  setSelectedCurrency(e);
                  setAppData("currency", e.value);
                }
              }}
            />
          </div>
          <div className="mt-4 w-full">
            <label className="text-default mb-1 block text-sm font-medium">{t("refund_policy")}</label>
            <RadioGroup.Root
              disabled={disabled}
              defaultValue="never"
              className="flex flex-col stack-y-2"
              value={getAppData("refundPolicy")}
              onValueChange={(val) => {
                setAppData("refundPolicy", val);
                if (val !== RefundPolicy.DAYS) {
                  setAppData("refundDaysCount", undefined);
                  setAppData("refundCountCalendarDays", undefined);
                }
              }}>
              <RadioField className="w-fit" value={RefundPolicy.ALWAYS} label={t("always")} id="always" />
              <RadioField className="w-fit" value={RefundPolicy.NEVER} label={t("never")} id="never" />
              <div className={classNames("text-default mb-2 flex flex-wrap items-center text-sm")}>
                <RadioGroup.Item
                  className="min-w-4 bg-default border-default flex h-4 w-4 cursor-pointer items-center rounded-full border focus:border-2 focus:outline-none ltr:mr-2 rtl:ml-2"
                  value="days"
                  id="days">
                  <RadioGroup.Indicator className="after:bg-inverted relative flex h-4 w-4 items-center justify-center after:block after:h-2 after:w-2 after:rounded-full" />
                </RadioGroup.Item>
                <div className="flex items-center">
                  <span className="me-2 ms-2">&nbsp;{t("if_cancelled")}</span>
                  <TextField
                    labelSrOnly
                    type="number"
                    className={classNames(
                      "border-default my-0 block w-16 text-sm [appearance:textfield] ltr:mr-2 rtl:ml-2"
                    )}
                    placeholder="2"
                    disabled={disabled}
                    min={0}
                    defaultValue={getAppData("refundDaysCount")}
                    required={getAppData("refundPolicy") === RefundPolicy.DAYS}
                    value={getAppData("refundDaysCount") ?? ""}
                    onChange={(e) => setAppData("refundDaysCount", parseInt(e.currentTarget.value))}
                  />
                  <Select
                    options={dayTypeOptions}
                    isSearchable={false}
                    isDisabled={disabled}
                    onChange={(option) => setAppData("refundCountCalendarDays", option?.value === 1)}
                    value={getSelectedDayType()}
                    defaultValue={getSelectedDayType()}
                  />
                  <span className="me-2 ms-2">&nbsp;{t("before")}</span>
                </div>
              </div>
            </RadioGroup.Root>
          </div>
        </>
      )}
    </>
  );
};

export default EventTypeAppSettingsInterface;
```

- [ ] **Step 3: Commit**

```bash
git add packages/app-store/paystack/components/EventTypeAppCardInterface.tsx packages/app-store/paystack/components/EventTypeAppSettingsInterface.tsx
git commit -m "feat(paystack): add event type configuration UI components"
```

---

### Task 10: Setup Page

**Files:**
- Create: `packages/app-store/paystack/pages/setup/_getStaticProps.tsx`
- Create: `apps/web/components/apps/paystack/Setup.tsx`

- [ ] **Step 1: Create _getStaticProps.tsx**

```typescript
import type { GetStaticPropsContext } from "next";

import getAppKeysFromSlug from "../../../_utils/getAppKeysFromSlug";

export const getStaticProps = async (ctx: GetStaticPropsContext) => {
  if (typeof ctx.params?.slug !== "string") return { notFound: true } as const;
  let publicKey = "";
  let secretKey = "";
  const appKeys = await getAppKeysFromSlug("paystack");
  if (typeof appKeys.public_key === "string" && typeof appKeys.secret_key === "string") {
    publicKey = appKeys.public_key;
    secretKey = appKeys.secret_key;
  }

  return {
    props: {
      publicKey,
      secretKey,
    },
  };
};
```

- [ ] **Step 2: Create Setup.tsx**

```tsx
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Toaster } from "sonner";

import AppNotInstalledMessage from "@calcom/app-store/_components/AppNotInstalledMessage";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import { Button } from "@calcom/ui/components/button";
import { TextField } from "@calcom/ui/components/form";
import { showToast } from "@calcom/ui/components/toast";

export default function PaystackSetup() {
  const [newPublicKey, setNewPublicKey] = useState("");
  const [newSecretKey, setNewSecretKey] = useState("");
  const router = useRouter();
  const { t } = useLocale();

  const integrations = trpc.viewer.apps.integrations.useQuery({
    variant: "payment",
    appId: "paystack",
  });

  const [paystackCredentials] = integrations.data?.items || [];
  const [credentialId] = paystackCredentials?.userCredentialIds || [-1];

  const showContent = !!integrations.data && integrations.isSuccess && !!credentialId;

  const saveKeysMutation = trpc.viewer.apps.updateAppCredentials.useMutation({
    onSuccess: () => {
      showToast(t("keys_have_been_saved"), "success");
      router.push("/event-types");
    },
    onError: (error) => {
      showToast(error.message, "error");
    },
  });

  if (integrations.isPending) {
    return <div className="absolute z-50 flex h-screen w-full items-center bg-gray-200" />;
  }

  return (
    <div className="bg-default flex h-screen">
      {showContent ? (
        <div className="bg-default border-subtle m-auto max-w-[43em] overflow-auto rounded border pb-10 md:p-10">
          <div className="ml-2 ltr:mr-2 rtl:ml-2 md:ml-5">
            <div className="invisible md:visible">
              <img className="h-11" src="/api/app-store/paystack/icon.svg" alt="Paystack" />
              <p className="text-default mt-5 text-lg">Paystack</p>
            </div>

            <form autoComplete="off" className="mt-5">
              <TextField
                label="Public Key"
                type="text"
                name="public_key"
                id="public_key"
                value={newPublicKey}
                onChange={(e) => setNewPublicKey(e.target.value)}
                role="presentation"
                className="mb-6"
                placeholder="pk_test_xxxxxxxxx"
              />

              <TextField
                label="Secret Key"
                type="password"
                name="secret_key"
                id="secret_key"
                value={newSecretKey}
                autoComplete="new-password"
                role="presentation"
                onChange={(e) => setNewSecretKey(e.target.value)}
                placeholder="sk_test_xxxxxxxxx"
              />

              <div className="mt-5 flex flex-row justify-end">
                <Button
                  color="primary"
                  onClick={() => {
                    saveKeysMutation.mutate({
                      credentialId,
                      key: {
                        public_key: newPublicKey,
                        secret_key: newSecretKey,
                      },
                    });
                  }}>
                  {t("save")}
                </Button>
              </div>
            </form>

            <div className="mt-5">
              <p className="text-default font-bold">Getting Started</p>
              <p className="text-default mt-2">
                To use Paystack with Cal.com, you need a Paystack account. Get your API keys from your{" "}
                <a
                  className="text-blue-600 underline"
                  target="_blank"
                  href="https://dashboard.paystack.com/#/settings/developers"
                  rel="noreferrer">
                  Paystack Dashboard
                </a>
                .
              </p>

              <p className="text-default mt-4 font-bold">Webhook Setup</p>
              <p className="text-default mt-2">
                Add this webhook URL in your Paystack dashboard under Settings &gt; API Keys &amp; Webhooks:
              </p>
              <code className="bg-subtle mt-2 block rounded p-2 text-sm">
                {typeof window !== "undefined" ? window.location.origin : "https://your-cal.com"}
                /api/integrations/paystack/webhook
              </code>
            </div>
          </div>
        </div>
      ) : (
        <AppNotInstalledMessage appName="paystack" />
      )}

      <Toaster position="bottom-right" />
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/app-store/paystack/pages/setup/_getStaticProps.tsx apps/web/components/apps/paystack/Setup.tsx
git commit -m "feat(paystack): add setup page for API key configuration"
```

---

### Task 11: Payment Page Component

**Files:**
- Create: `packages/app-store/paystack/components/PaystackPaymentComponent.tsx`

- [ ] **Step 1: Create PaystackPaymentComponent.tsx**

This component renders on the `/payment/{uid}` page when the payment's `appId` is `"paystack"`.

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import type { Payment } from "@calcom/prisma/client";
import { Button } from "@calcom/ui/components/button";

interface PaystackPaymentData {
  access_code: string;
  authorization_url: string;
  publicKey: string;
  reference: string;
}

interface PaystackPaymentComponentProps {
  payment: Payment & {
    data: PaystackPaymentData;
  };
  clientId: string;
  bookingUid: string;
  bookingTitle: string;
  amount: number;
  currency: string;
}

export default function PaystackPaymentComponent({
  payment,
  bookingUid,
  bookingTitle,
  amount,
  currency,
}: PaystackPaymentComponentProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const popupRef = useRef<unknown>(null);

  const paymentData = payment.data as unknown as PaystackPaymentData;

  const formattedAmount = new Intl.NumberFormat("en", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(amount / 100);

  const handlePayment = async () => {
    setStatus("loading");
    setErrorMessage("");

    try {
      const PaystackPop = (await import("@paystack/inline-js")).default;
      const popup = new PaystackPop();

      popupRef.current = popup;

      popup.resumeTransaction(paymentData.access_code, {
        onSuccess: async () => {
          setStatus("success");

          // Backup verification — call our verify endpoint
          try {
            await fetch(
              `/api/integrations/paystack/verify?reference=${paymentData.reference}`
            );
          } catch {
            // Webhook will handle it if this fails
          }

          // Redirect to booking confirmation
          setTimeout(() => {
            window.location.href = `/booking/${bookingUid}`;
          }, 2000);
        },
        onCancel: () => {
          setStatus("idle");
        },
        onError: () => {
          setStatus("error");
          setErrorMessage("Payment failed. Please try again.");
        },
      });
    } catch (err) {
      setStatus("error");
      setErrorMessage("Failed to load payment. Please try again.");
    }
  };

  if (status === "success") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 p-6">
        <div className="text-success text-2xl font-bold">Payment Successful</div>
        <p className="text-default">Redirecting to your booking confirmation...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-6">
      <h2 className="text-emphasis text-xl font-semibold">{bookingTitle}</h2>
      <p className="text-default text-lg">{formattedAmount}</p>

      {errorMessage && <p className="text-error text-sm">{errorMessage}</p>}

      <Button
        color="primary"
        onClick={handlePayment}
        loading={status === "loading"}
        disabled={status === "loading"}
        data-testid="paystack-pay-button">
        Pay with Paystack
      </Button>

      {status === "idle" && (
        <p className="text-subtle text-xs">You will be prompted to enter your payment details</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/app-store/paystack/components/PaystackPaymentComponent.tsx
git commit -m "feat(paystack): add payment page component with inline popup checkout"
```

---

### Task 12: Run App Store CLI Build & Verify Auto-Discovery

**Files:**
- None created — this verifies that Cal.com's build tool picks up the new package.

- [ ] **Step 1: Run the app store CLI build**

```bash
cd packages/app-store-cli && npx ts-node src/build.ts
```

This should regenerate `packages/app-store/payment.services.generated.ts` and include:

```typescript
paystack: import("./paystack/lib/PaymentService"),
```

- [ ] **Step 2: Verify the generated file includes paystack**

```bash
grep "paystack" packages/app-store/payment.services.generated.ts
```

Expected: a line containing `paystack: import("./paystack/lib/PaymentService")`.

- [ ] **Step 3: Install dependencies**

```bash
# From the Cal.com root
yarn install
```

This installs `@paystack/inline-js` for the paystack package.

- [ ] **Step 4: Build to check for type errors**

```bash
yarn build --filter=@calcom/paystack
```

Expected: Build succeeds with no type errors.

- [ ] **Step 5: Commit any generated file changes**

```bash
git add packages/app-store/payment.services.generated.ts
git commit -m "build: regenerate payment services map with paystack"
```

---

### Task 13: Seed the App in Database

**Files:**
- None new — uses Cal.com's existing app seeding mechanism.

- [ ] **Step 1: Add Paystack to the app seed data**

Cal.com seeds apps from `packages/prisma/seed-app-store.ts`. Add the Paystack entry:

Find the existing payment app entries and add after them:

```typescript
await createApp("paystack", "paystack", ["payment"], "paystack_payment", {
  // No env vars needed — uses credential-based keys
});
```

If the seed file uses a different pattern, follow the existing pattern for PayPal.

- [ ] **Step 2: Run the seed**

```bash
cd packages/prisma && npx ts-node seed-app-store.ts
```

- [ ] **Step 3: Verify app appears in Cal.com**

Start the dev server (`yarn dev`), navigate to Settings > Apps > Payment. "Paystack" should appear in the list.

- [ ] **Step 4: Commit**

```bash
git add packages/prisma/seed-app-store.ts
git commit -m "feat(paystack): add Paystack to app store seed data"
```

---

### Task 14: End-to-End Manual Testing

- [ ] **Step 1: Install the app**

1. Go to Settings > Apps > Payment
2. Click "Paystack" > Install
3. Enter your Paystack test keys (`pk_test_...`, `sk_test_...`)
4. Save

- [ ] **Step 2: Configure an event type with Paystack payment**

1. Edit an event type > Apps tab
2. Enable Paystack
3. Set price (e.g., 5000 NGN)
4. Set currency to NGN
5. Save

- [ ] **Step 3: Test the booking flow**

1. Open the event type's public booking page
2. Select a time and fill in the form
3. Submit — should redirect to `/payment/{uid}`
4. Click "Pay with Paystack" — popup should appear
5. Use Paystack test card to complete payment
6. Verify: booking status changes to confirmed, calendar event created

- [ ] **Step 4: Configure the webhook in Paystack dashboard**

1. Go to Paystack dashboard > Settings > API Keys & Webhooks
2. Set webhook URL to `https://your-cal.com/api/integrations/paystack/webhook`
3. Use ngrok or similar for local testing

- [ ] **Step 5: Test refund flow**

1. Cancel a paid booking within the refund window
2. Verify refund is initiated on Paystack
3. Check Payment record has `refunded: true`

---
