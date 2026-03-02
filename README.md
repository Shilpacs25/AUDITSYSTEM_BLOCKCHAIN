# Audit Management System with Blockchain Verification

A robust auditing platform that combines traditional relational databases (MySQL) with NoSQL (MongoDB) and Blockchain (Ethereum) to ensure absolute data integrity and tamper-proof evidence tracking.

## 🚀 Quick Start
1. **Install Dependencies**: `npm install`
2. **Setup Databases**: Ensure MySQL and MongoDB are running.
3. **Configure Environment**: Update `.env` with your credentials.
4. **Deploy Smart Contract**: `cd audit-blockchain && truffle migrate`
5. **Run Server**: `npm start`

## 📖 Documentation
Detailed project documentation, including architecture, API references, and system workflows, can be found in [PROJECT_DOCUMENTATION.md](./PROJECT_DOCUMENTATION.md).

## 🛡️ Key Features
- **Blockchain Anchoring**: Every critical audit log is hashed and stored on-chain.
- **Tamper Detection**: Automated reconciliation between SQL data and Blockchain hashes.
- **Evidence Vault**: Secure file hashing and tracking using MongoDB and Blockchain.
- **Real-time Monitoring**: Live security event dashboard.

