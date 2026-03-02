# Audit System with Blockchain Verification - Project Documentation

## 1. Project Overview
This project is an **Audit Management System** designed to ensure data integrity and transparency using **Blockchain technology**. It tracks financial transactions and their associated audit trails, anchoring critical data points to an immutable blockchain ledger (Ethereum). This allows for proactive tamper detection and verifiable evidence management.

---

## 2. Technology Stack

### Backend
- **Node.js & Express.js**: The core server engine handling API requests and business logic.
- **MySQL**: The primary relational database for structured data like transactions, businesses, and audit logs.
- **MongoDB**: A document-based database used for storing evidence metadata and file hashes.
- **Web3.js**: The library used to interact with the Ethereum blockchain and smart contracts.
- **Socket.io**: Enables real-time communication between the backend and frontend for instant updates (e.g., integrity alerts).

### Blockchain
- **Solidity**: Used for writing the `AuditContract` smart contract.
- **Truffle Suite**: Framework for developing, testing, and deploying the smart contract.
- **Ethereum**: The underlying blockchain network (optimized for Ganache or a private testnet for local development).

### Frontend
- **Vanilla JS / HTML / CSS**: Responsive and dynamic interface for Users, Auditors, and Admins.

---

## 3. System Architecture

The system utilizes a **dual-database strategy combined with a blockchain anchor**:
1. **Validator DB (MySQL)**: High-performance storage for everyday operations.
2. **Evidence DB (MongoDB)**: Scalable storage for file-related hashes.
3. **Immutable Anchor (Blockchain)**: Stores the cryptographic proof (hashes) of the data in the databases.

### Core Schema (MySQL)
- `Business`: Stores information about companies being audited.
- `Transactions`: Stores financial records (Status, Amount, Category, etc.).
- `Audit_Log`: Tracks every action taken on a transaction (Created, Verified, Updated).
- `Blockchain_Record`: Maps MySQL logs to their corresponding blockchain blocks.
- `Invoices/Reviews`: Secondary data linked to transactions.

---

## 4. Key Features

### 4.1. Evidence Management
When an evidence file (e.g., an invoice) is uploaded:
- The system generates a **SHA-256 hash** of the file.
- The hash is stored in **MongoDB** for quick retrieval.
- The record is then "anchored" to the **Blockchain**, ensuring that any modification to the file or the SQL record will result in a hash mismatch during verification.

### 4.2. Blockchain Synchronization
- **Automatic Anchoring**: Critical actions (like `VERIFIED`) trigger a blockchain transaction.
- **Manual Sync**: Admins can force a sync of all unanchored logs.
- **Repair Utility**: A diagnostic tool that identifies missing blocks and re-anchors them to restore the audit trail.

### 4.3. Integrity Verification & Tamper Detection
This is the "Heart" of the system. The verification algorithm works as follows:
1. Fetch all hashes from the **Blockchain**.
2. For each block, find the corresponding record in **MySQL**.
3. Re-calculate the hash using the **live MySQL data**.
4. Compare the **Re-calculated Hash** with the **On-chain Hash**.
5. **If mismatch**: Flag the record as "TAMPERED".
6. **If record missing from SQL**: Flag as "ORPHAN BLOCK" (Deletion detection).

### 4.4. Security Event Monitor
A real-time dashboard for administrators that displays:
- Database Status (Live/Offline).
- Integrity Score (Percentage of verified records).
- Detailed Transaction logs with blockchain transaction IDs.

---

## 5. API Reference (Key Endpoints)

### Blockchain Routes (`/api/blockchain`)
- `POST /generate-hash/:transactionId`: Mines a new block for a specific transaction's logs.
- `GET /verify-all`: Performs a full system integrity check.
- `POST /repair`: Re-anchors missing logs to the blockchain.
- `GET /logs`: Fetches the audit log history.

### Evidence Routes (`/api/evidence`)
- `POST /upload`: Handles file uploads, hashing, and MongoDB storage.
- `GET /status/:transactionId`: Checks the verification status of evidence.

---

## 6. Smart Contract Details
**Contract Name**: `AuditContract.sol`
- **`AuditRecord` Struct**: Stores `logId`, `actionType`, `recordHash`, `evidenceHash`, `timestamp`, and `auditor` address.
- **`addAuditLog`**: Function used to append a new record to the chain.
- **`getAuditTrail`**: Returns the entire history for verification.

---

## 7. Setup & Installation

### Prerequisites
- Node.js (v16+)
- MySQL Server
- MongoDB Server
- Truffle (Global install: `npm install -g truffle`)
- Ganache (For local blockchain)

### Installation
1. Clone the repository.
2. Run `npm install`.
3. Configure `.env` with your database credentials and blockchain provider URL.
4. Deploy the smart contract:
   ```bash
   cd audit-blockchain
   truffle migrate --reset
   ```
5. Initialize the database:
   ```bash
   node scripts/setup_db.js
   ```
6. Start the server:
   ```bash
   npm start
   ```

---

## 8. Directory Structure
```text
/
├── audit-blockchain/   # Truffle project & Solidity contracts
├── config/             # DB & Real-time configurations
├── models/             # MongoDB Mongoose models
├── public/             # Frontend assets
├── routes/             # API Router definitions
├── scripts/            # Database utility scripts
├── server.js           # Main application entry point
└── .env                # Environment variables
```
