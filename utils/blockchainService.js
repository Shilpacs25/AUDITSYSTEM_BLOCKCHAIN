const Web3 = require('web3');
const path = require('path');
const fs = require('fs');

const loadContractJSON = () => {
    try {
        const jsonPath = path.join(__dirname, '../audit-blockchain/build/contracts/AuditContract.json');
        if (fs.existsSync(jsonPath)) {
            return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
        }
    } catch (e) {
        console.error("Blockchain Artifact Load Error:", e.message);
    }
    return null;
};

// Singleton State
let web3Instance = null;
let contractInstance = null;
let serverAccountInstance = null;
let currentContractAddress = null;

// Cache for Blockchain Data
let cachedAuditTrail = null;
let lastCacheTime = 0;
const CACHE_TTL = 2000; // 2 seconds

const getWeb3 = () => {
    if (!web3Instance) {
        web3Instance = new Web3("http://127.0.0.1:7545");
    }
    return web3Instance;
};

const initContract = async () => {
    const contractJSON = loadContractJSON();
    if (!contractJSON) {
        throw new Error("Smart Contract artifacts (AuditContract.json) not found.");
    }

    const web3 = getWeb3();
    const networkId = await web3.eth.net.getId();
    const deployedNetwork = contractJSON.networks[networkId];
    
    if (!deployedNetwork) {
        throw new Error(`Contract not deployed to network ${networkId}. Run 'truffle migrate --reset'.`);
    }

    // If address changed or not initialized, update instance
    if (!contractInstance || currentContractAddress !== deployedNetwork.address) {
        const code = await web3.eth.getCode(deployedNetwork.address);
        if (code === '0x' || code === '0x0') {
            throw new Error(`No contract found at ${deployedNetwork.address}. Redeploy needed.`);
        }

        contractInstance = new web3.eth.Contract(contractJSON.abi, deployedNetwork.address);
        const accounts = await web3.eth.getAccounts();
        serverAccountInstance = accounts[0];
        currentContractAddress = deployedNetwork.address;
        console.log(`[Blockchain] Singleton reloaded: ${currentContractAddress}`);
    }

    return { contract: contractInstance, serverAccount: serverAccountInstance, web3 };
};

const getFullAuditTrail = async () => {
    const now = Date.now();
    if (cachedAuditTrail && (now - lastCacheTime < CACHE_TTL)) {
        return cachedAuditTrail;
    }

    const { contract } = await initContract();
    const rawCount = await contract.methods.getAuditCount().call();
    const countVal = parseInt(rawCount.toString());
    
    if (isNaN(countVal) || countVal === 0) return [];

    const records = [];
    const batchSize = 10;
    
    for (let i = 0; i < countVal; i += batchSize) {
        const end = Math.min(i + batchSize, countVal);
        const batchPromises = [];
        for (let j = i; j < end; j++) {
            batchPromises.push(
                contract.methods.getAudit(j).call()
                    .catch(async () => {
                        const raw = await contract.methods.auditTrail(j).call();
                        // auditTrail(j) returns [logId, actionType, recordHash, evidenceHash, timestamp]
                        return {
                            logId: raw[0],
                            actionType: raw[1],
                            recordHash: raw[2],
                            evidenceHash: raw[3],
                            timestamp: raw[4]
                        };
                    })
            );
        }
        const results = await Promise.all(batchPromises);
        records.push(...results);
    }

    cachedAuditTrail = records;
    lastCacheTime = now;
    return records;
};

const crypto = require('crypto');
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');

const getTransactionDataString = (tx) => {
    const d = new Date(tx.Date);
    const dateStr = d.getUTCFullYear() + '-' + 
                    String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + 
                    String(d.getUTCDate()).padStart(2, '0');
    // Ensure 2 decimal places and absolute number
    const amountStr = parseFloat(tx.Amount || 0).toFixed(2);
    const statusStr = 'Pending'; 
    return `${tx.Transaction_ID}|${statusStr}|${dateStr}|${amountStr}|${tx.Category || ''}|${tx.Description || ''}|${tx.Business_ID}`;
};

const isTransactionTampered = async (transactionId, db, Evidence) => {
    try {
        const onChainRecords = await getFullAuditTrail();
        const [dbLogs] = await db.query(`SELECT * FROM Audit_Log WHERE Transaction_ID = ?`, [transactionId]);
        const [txRows] = await db.query(`SELECT * FROM Transactions WHERE Transaction_ID = ?`, [transactionId]);
        
        if (txRows.length === 0) return true;
        const txn = txRows[0];
        const txDataString = getTransactionDataString(txn);
        const currentTxHash = sha256(txDataString);

        for (const log of dbLogs) {
            const chainRecord = onChainRecords.find(r => Number(r.logId) === log.Log_ID);
            if (!chainRecord) continue; // Not anchored yet, skip content check

            let currentHash;
            if (log.Action_Type === 'CREATED') {
                currentHash = currentTxHash;
            } else if (log.Action_Type === 'UPDATED') {
                currentHash = sha256(`${txDataString}|${chainRecord.evidenceHash}|UPDATED`);
            } else {
                currentHash = sha256(`${txDataString}|${log.Action_Type}`);
            }

            if (currentHash !== chainRecord.recordHash) {
                console.log(`[TamperCheck] Content Mismatch for Log ${log.Log_ID}. Expected: ${chainRecord.recordHash}, Found: ${currentHash}`);
                return true;
            }
        }
        return false;
    } catch (e) {
        console.error("[TamperCheck] Error:", e.message);
        return false; 
    }
};

module.exports = { initContract, sha256, getTransactionDataString, isTransactionTampered, getFullAuditTrail };
