# Remitless

Slogan: **"Send farther, pay nothing."**

A hackathon MVP for zero-fee remittance with a simple consumer UI and backend crypto rails simulation.

## Folder structure

- `frontend` - Next.js + Tailwind app (normal, user-friendly send money interface)
- `backend` - Express API for send flow, status updates, and transfer history

## MVP flow implemented

1. `Send Money` page takes `Amount (USD)` and `Recipient name`
2. Frontend calls `POST /api/send`
3. Backend simulates:
   - USD -> USDC (1:1)
   - USDC -> LKR via arbitrage rate
   - blockchain settlement hash (real TRON if env keys exist, otherwise mock hash)
4. Frontend shows:
   - sent amount
   - received LKR
   - time (~10 mins)
   - fee ($0)
   - status + tx hash
5. Optional dashboard section lists recent transfers

## Run locally

### Backend

```bash
cd backend
npm install
npm run dev
```

Create `.env` from `.env.example` if needed.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Optional API URL override:

`NEXT_PUBLIC_API_URL=http://localhost:4000`
