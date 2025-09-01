import { Client, Databases } from 'node-appwrite';

// --- Helper to fetch and parse a JSON document ---
const getAndParseJSON = async (db, databaseId, collectionId, documentId) => {
    const document = await db.getDocument(databaseId, collectionId, documentId);
    return JSON.parse(document.data || '{}');
};

// --- Task 1: Incrementally Update Teacher Stats ---
async function updateTeacherStats({ db, log, error, event, eventData }) {
    log('Starting: Incremental Teacher Stats Update...');
    const { APPWRITE_DATABASE_ID, STATS_COLLECTION_ID, STATS_DOCUMENT_ID, APPWRITE_NOTE_COLLECTION_ID, APPWRITE_FORM_COLLECTION_ID, APPWRITE_YOUTUBE_COLLECTION_ID } = process.env;

    // For stats, we only act on create and delete. Updates are too complex without knowing the "before" state.
    if (!event.includes('.create') && !event.includes('.delete')) {
        log('Skipping stats update for non-create/delete event.');
        return;
    }

    const userName = eventData.userName || eventData.createdBy;
    if (!userName) {
        log('Skipping stats update: No user to attribute.');
        return;
    }

    const statsData = await getAndParseJSON(db, APPWRITE_DATABASE_ID, STATS_COLLECTION_ID, STATS_DOCUMENT_ID);
    let userStats = statsData.find(u => u.name === userName);

    if (!userStats) {
        userStats = { name: userName, notes: 0, forms: 0, youtube: 0, total: 0 };
        statsData.push(userStats);
    }
    
    const collectionId = event.split('.')[3];
    const increment = event.includes('.create') ? 1 : -1;

    if (collectionId === APPWRITE_NOTE_COLLECTION_ID) userStats.notes += increment;
    if (collectionId === APPWRITE_FORM_COLLECTION_ID) userStats.forms += increment;
    if (collectionId === APPWRITE_YOUTUBE_COLLECTION_ID) userStats.youtube += increment;
    userStats.total += increment;

    // Ensure counts don't go below zero
    userStats.notes = Math.max(0, userStats.notes);
    userStats.forms = Math.max(0, userStats.forms);
    userStats.youtube = Math.max(0, userStats.youtube);
    userStats.total = Math.max(0, userStats.total);

    statsData.sort((a, b) => b.total - a.total);

    await db.updateDocument(
        APPWRITE_DATABASE_ID, STATS_COLLECTION_ID, STATS_DOCUMENT_ID,
        { data: JSON.stringify(statsData) }
    );
    log(`Finished: Incremental Teacher Stats Update for ${userName}.`);
}


// --- Task 2: Incrementally Update Links Cache ---
async function updateLinksCache({ db, log, error, event, eventData }) {
    log('Starting: Incremental Links Cache Update...');
    const { APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, LINKS_UPLOADERS_CACHE_DOCUMENT_ID } = process.env;

    // We only ADD to this cache on creation to keep it fast. Deletes are not handled incrementally.
    if (!event.includes('.create')) {
        log('Skipping links cache update for non-create event.');
        return;
    }
    
    const uploaderName = eventData.createdBy;
    if (!uploaderName) {
        log('Skipping links cache update: No uploader name found.');
        return;
    }

    const cacheData = await getAndParseJSON(db, APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, LINKS_UPLOADERS_CACHE_DOCUMENT_ID);
    const uploaders = cacheData.uploaders || [];

    if (!uploaders.includes(uploaderName)) {
        uploaders.push(uploaderName);
        uploaders.sort();
        await db.updateDocument(
            APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, LINKS_UPLOADERS_CACHE_DOCUMENT_ID,
            { data: JSON.stringify({ uploaders }) }
        );
        log(`Finished: Added ${uploaderName} to links cache.`);
    } else {
        log(`Finished: ${uploaderName} already in links cache.`);
    }
}


// --- Task 3: Incrementally Update Uploader Cache ---
async function updateUploaderCache({ db, log, error, event, eventData }) {
    log('Starting: Incremental Uploader Cache Update...');
    const { APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, UPLOADERS_CACHE_DOCUMENT_ID } = process.env;

    // This cache is for notes only.
    if (!event.includes('collections.' + process.env.APPWRITE_NOTE_COLLECTION_ID)) {
        log('Skipping uploader cache update for non-note event.');
        return;
    }

    // We only ADD to this cache on creation.
    if (!event.includes('.create')) {
        log('Skipping uploader cache update for non-create event.');
        return;
    }
    
    const { userName, abbreviation } = eventData;
    if (!userName || !abbreviation) {
        log('Skipping uploader cache update: Missing userName or abbreviation.');
        return;
    }

    const cacheData = await getAndParseJSON(db, APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, UPLOADERS_CACHE_DOCUMENT_ID);
    let hasChanged = false;

    // Ensure properties exist
    cacheData.all = cacheData.all || [];
    cacheData[abbreviation] = cacheData[abbreviation] || [];

    if (!cacheData.all.includes(userName)) {
        cacheData.all.push(userName);
        cacheData.all.sort();
        hasChanged = true;
    }
    if (!cacheData[abbreviation].includes(userName)) {
        cacheData[abbreviation].push(userName);
        cacheData[abbreviation].sort();
        hasChanged = true;
    }

    if (hasChanged) {
        await db.updateDocument(
            APPWRITE_DATABASE_ID, CACHE_COLLECTION_ID, UPLOADERS_CACHE_DOCUMENT_ID,
            { data: JSON.stringify(cacheData) }
        );
        log(`Finished: Updated uploader cache for ${userName} in ${abbreviation}.`);
    } else {
        log(`Finished: ${userName} already in uploader cache for ${abbreviation}.`);
    }
}


// --- Main Exported Function ---
export default async ({ req, res, log, error }) => {
    const client = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT)
        .setKey(process.env.APPWRITE_API_KEY);
    const db = new Databases(client);

    const event = req.headers['x-appwrite-event'];
    const eventData = req.body;
    log(`Incremental update triggered by event: ${event}`);

    try {
        const taskArgs = { db, log, error, event, eventData };

        // Use Promise.allSettled to run all tasks and ensure that one failure
        // doesn't prevent other tasks from completing.
        const results = await Promise.allSettled([
            updateTeacherStats(taskArgs),
            updateLinksCache(taskArgs),
            updateUploaderCache(taskArgs),
        ]);

        results.forEach((result, i) => {
            if (result.status === 'rejected') {
                error(`Task ${i + 1} failed: ${result.reason}`);
            }
        });

        return res.json({ success: true, message: 'Incremental updates processed.' });
    } catch (e) {
        error(`A critical error occurred in the main handler: ${e.message}`);
        return res.json({ success: false, error: e.message }, 500);
    }
};