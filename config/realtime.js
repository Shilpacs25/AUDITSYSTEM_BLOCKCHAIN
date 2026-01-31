const Evidence = require('../models/Evidence');

module.exports = (io) => {
    try {
        console.log("Initializing Realtime Admin Stream...");
        
        // Watch for ANY change in Evidence collection
        const changeStream = Evidence.watch();

        changeStream.on('change', (change) => {
            // Only emit relevant events (insert, update, delete)
            if (['insert', 'update', 'delete', 'replace'].includes(change.operationType)) {
                console.log(`[Realtime] Evidence Change Detected: ${change.operationType}`);
                
                // Notify Admin Client to refresh data
                io.emit('admin-refresh', {
                    source: 'MongoDB',
                    type: change.operationType,
                    timestamp: new Date()
                });
            }
        });

        changeStream.on('error', (err) => {
            console.error("[Realtime] Stream Error:", err);
        });

    } catch (error) {
        console.error("[Realtime] Initialization Failed:", error);
    }
};
