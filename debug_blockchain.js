const Web3 = require('web3');
const path = require('path');
const fs = require('fs');

async function debug() {
    const web3 = new Web3("http://127.0.0.1:7545");
    const jsonPath = path.join(__dirname, 'audit-blockchain', 'build', 'contracts', 'AuditContract.json');
    
    if (!fs.existsSync(jsonPath)) {
        console.error("Artifact missing at:", jsonPath);
        return;
    }

    const contractJSON = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    
    try {
        const networkId = await web3.eth.net.getId();
        console.log("Network ID:", networkId);
        
        const deployedNetwork = contractJSON.networks[networkId];
        if (!deployedNetwork) {
            console.error("Not deployed to this network in JSON.");
            return;
        }
        
        console.log("Deployed Address:", deployedNetwork.address);
        
        const code = await web3.eth.getCode(deployedNetwork.address);
        if (code === '0x' || code === '0x0') {
            console.error("NO CODE AT ADDRESS! You need to migrate.");
            return;
        }

        const contract = new web3.eth.Contract(contractJSON.abi, deployedNetwork.address);
        const count = await contract.methods.getAuditCount().call();
        console.log("Audit Count on Chain:", count);
        
        for(let i=0; i<count; i++) {
            try {
                const record = await contract.methods.getAudit(i).call();
                console.log(`Record ${i}:`, record.logId, record.actionType, record.recordHash);
            } catch (e) {
                console.error(`Failed to decode record ${i}:`, e.message);
                const raw = await contract.methods.auditTrail(i).call();
                console.log(`Raw Record ${i}:`, raw);
            }
        }
    } catch (e) {
        console.error("Debug Error:", e.message);
    }
}

debug();
