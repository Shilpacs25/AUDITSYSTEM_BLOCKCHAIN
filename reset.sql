CREATE DATABASE IF NOT EXISTS audit_system;
USE audit_system;
SET FOREIGN_KEY_CHECKS=0;

-- Drop existing tables to ensure a clean slate
DROP TABLE IF EXISTS Audit_Log;
DROP TABLE IF EXISTS Blockchain_Record;
DROP TABLE IF EXISTS Invoice;
DROP TABLE IF EXISTS Reviews;
DROP TABLE IF EXISTS Transactions;
DROP TABLE IF EXISTS Business;
DROP TABLE IF EXISTS Auditor;

SET FOREIGN_KEY_CHECKS=1;

-- =============================================
-- FULL SCHEMA DEFINITION
-- =============================================

CREATE TABLE Business (
    Business_ID INT PRIMARY KEY AUTO_INCREMENT,
    Business_Name VARCHAR(100),
    Registration_No VARCHAR(50),
    Industry_Type VARCHAR(50),
    Contact_email VARCHAR(100),
    Address VARCHAR(200)
);

CREATE TABLE Transactions (
    Transaction_ID INT PRIMARY KEY AUTO_INCREMENT,
    Status VARCHAR(50) DEFAULT 'Created',
    Date DATE,
    Amount DECIMAL(10, 2),
    Category VARCHAR(100),
    Description TEXT,
    Business_ID INT,
    FOREIGN KEY (Business_ID) REFERENCES Business(Business_ID) ON DELETE SET NULL
) AUTO_INCREMENT=1000;

CREATE TABLE Invoice (
    Invoice_ID INT PRIMARY KEY AUTO_INCREMENT,
    Transaction_ID INT NOT NULL,
    File_Hash VARCHAR(255),
    Storage_Path VARCHAR(255),
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE CASCADE
);

CREATE TABLE Reviews (
    Review_ID INT PRIMARY KEY AUTO_INCREMENT,
    Transaction_ID INT NOT NULL,
    Auditor_ID INT,
    Comments TEXT,
    Verdict VARCHAR(50),
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE CASCADE
);

CREATE TABLE Audit_Log (
    Log_ID INT PRIMARY KEY AUTO_INCREMENT,
    Transaction_ID INT,
    Auditor_ID INT,
    Action_Type VARCHAR(50),
    Verification_Status VARCHAR(50),
    Record_Hash VARCHAR(255),
    Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE SET NULL
) AUTO_INCREMENT=1000;

CREATE TABLE Blockchain_Record (
    Record_ID INT PRIMARY KEY AUTO_INCREMENT,
    Transaction_ID INT,
    Block_Hash VARCHAR(255),
    Block_Height INT,
    Timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (Transaction_ID) REFERENCES Transactions(Transaction_ID) ON DELETE CASCADE
);

CREATE TABLE Auditor (
    Auditor_ID INT PRIMARY KEY AUTO_INCREMENT,
    Name VARCHAR(100),
    Email VARCHAR(100),
    Role VARCHAR(50)
);

ALTER TABLE Audit_Log ADD CONSTRAINT fk_auditlog_auditor FOREIGN KEY (Auditor_ID) REFERENCES Auditor(Auditor_ID) ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert Seed Data
INSERT INTO Business (Business_Name, Registration_No, Industry_Type, Contact_email, Address) 
VALUES ('Tech Corp', 'REG12345', 'IT', 'contact@techcorp.com', '123 Tech Lane');

INSERT INTO Auditor (Auditor_ID, Name, Email, Role) VALUES 
(1, 'System', 'system@audit.os', 'SYSTEM'),
(999, 'System Bot', 'bot@audit.os', 'BOT');

INSERT INTO Transactions (Status, Date, Amount, Category, Description, Business_ID) 
VALUES ('Pending', '2025-01-01', 0.00, 'Test', 'Fresh Start Transaction', 1);

SELECT * FROM Transactions;
-- tamper
UPDATE transactions
SET amount = 5000.00
WHERE Business_ID = 1;

UPDATE Transactions SET Amount = 124500.00 WHERE Transaction_ID = 14;
DELETE FROM Transactions
WHERE Transaction_ID IN (6, 7, 8, 9, 10, 11, 14);
