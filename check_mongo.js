const mongoose = require('mongoose');
const Evidence = require('./models/Evidence');

async function checkData() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/audit_evidence');
        const docs = await Evidence.find({}, { transaction_id: 1, file_name: 1, _id: 1 });
        console.log("=== EVIDENCE DATA IN MONGO ===");
        console.log(JSON.stringify(docs, null, 2));
        mongoose.disconnect();
    } catch (e) {
        console.error(e);
    }
}

checkData();
