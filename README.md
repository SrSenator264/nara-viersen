# NARA – Restaurant Operations Platform

NARA is a local-first restaurant operations platform for cashier workflows, live orders, kitchen coordination, delivery operations, staff management, accounting support, and customer ordering.

## Main areas

- Cashier and sales workflow
- Live order intake and order status tracking
- Kitchen display and preparation coordination
- Delivery and driver workflow
- Customer ordering assistant
- Invoices, archive, and accounting support
- German and multilingual interface support

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm start
```

Then open `http://localhost:4174`.

This repository currently has no npm dependencies. `npm install` is not required
unless dependencies are added later.

## Configuration

Copy `.env.example` to `.env` and fill in local values where required. Never commit `.env`, API keys, passwords, payment credentials, or private certificates.

The server reads the port and provider settings from environment variables. Keep
real values only in the local `.env` file.

## Important

Review local configuration and payment-provider settings before production use.
