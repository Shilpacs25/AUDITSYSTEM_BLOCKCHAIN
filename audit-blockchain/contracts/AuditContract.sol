// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract AuditContract {
    
    struct AuditRecord {
        uint256 logId;        // Link to MySQL Log_ID
        string actionType;    // Tiny string: "CREATED", "VERIFIED"
        string recordHash;    // Hash of the DB record details
        string evidenceHash;  // Hash of the file (if any)
        uint256 timestamp;    // Blockchain timestamp
        address auditor;      // Who committed this?
    }

    // Using an array ensures order is preserved (0, 1, 2...)
    AuditRecord[] public auditTrail;
    
    // Mapping for quick validity checks (prevents duplicate Log IDs)
    mapping(uint256 => bool) public logIdExists;

    event AuditLogged(uint256 indexed logId, address indexed auditor, uint256 timestamp);

    function addAuditLog(
        uint256 _logId,
        string memory _actionType,
        string memory _recordHash,
        string memory _evidenceHash
    ) public {
        require(!logIdExists[_logId], "Error: Log ID already exists on-chain.");

        AuditRecord memory newRecord = AuditRecord({
            logId: _logId,
            actionType: _actionType,
            recordHash: _recordHash,
            evidenceHash: _evidenceHash,
            timestamp: block.timestamp,
            auditor: msg.sender
        });

        auditTrail.push(newRecord);
        logIdExists[_logId] = true;

        emit AuditLogged(_logId, msg.sender, block.timestamp);
    }

    // Get total count (for looping)
    function getAuditCount() public view returns (uint256) {
        return auditTrail.length;
    }

    // Get specific record
    function getAudit(uint256 _index) public view returns (AuditRecord memory) {
        return auditTrail[_index];
    }
}
