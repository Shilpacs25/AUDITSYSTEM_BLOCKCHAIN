const mongoose = require('mongoose');

const EvidenceSchema = new mongoose.Schema({
    transaction_id: {
        type: Number,
        required: true
    },
    document_type: {
        type: String,
        required: true
    },
    description: String,

    // ✅ ADD THESE
    file_name: String,
    file_hash: String,
    storage_path: String,
    file_data: Buffer, // ✅ Store file binary (BSON)

    uploaded_by: String,
    created_at: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Evidence', EvidenceSchema);
