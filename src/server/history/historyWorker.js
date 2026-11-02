import { parentPort, workerData } from 'node:worker_threads';
import HistoryDatabase from './HistoryDatabase.js';

const store = new HistoryDatabase(workerData.filePath, workerData.limit);
// Yield between users when shrinking/reindexing a large archive.
for (const user of store.resizeUsers()) await new Promise(resolve => setImmediate(resolve));
parentPort.postMessage({ ready: true });
parentPort.on('message', ({ id, action, data }) => {
    try {
        let result;
        if (action === 'append') store.appendBatch(data);
        else if (action === 'query') result = store.query(data);
        else if (action === 'close') store.close();
        else throw new Error('Unknown history operation');
        parentPort.postMessage({ id, result });
        if (action === 'close') parentPort.close();
    } catch (error) {
        parentPort.postMessage({ id, error: error.message });
    }
});
