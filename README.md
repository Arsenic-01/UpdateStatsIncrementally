# Incremental Updates Function for Appwrite

This cloud function performs incremental updates for various caches and statistics in an Appwrite project whenever database events occur.

---

## Features

* **Teacher Stats Tracking**: Increments/decrements counts of uploaded resources (notes, forms, YouTube links) for each teacher.
* **Links Cache Update**: Maintains a quick-access cache of users who uploaded links.
* **Uploader Cache Update**: Tracks which users have uploaded notes, organized by subject abbreviation.
* Runs all update tasks concurrently using `Promise.allSettled` for resilience.

---

## Environment Variables

Set these variables in your Appwrite Function settings:

| Key                                 | Description                                                 |
| ----------------------------------- | ----------------------------------------------------------- |
| `APPWRITE_ENDPOINT`                 | Your Appwrite endpoint                                      |
| `APPWRITE_PROJECT`                  | Appwrite Project ID                                         |
| `APPWRITE_API_KEY`                  | API key with database access                                |
| `APPWRITE_DATABASE_ID`              | Database ID where stats and cache collections exist         |
| `STATS_COLLECTION_ID`               | Collection ID for teacher statistics                        |
| `STATS_DOCUMENT_ID`                 | Document ID inside stats collection storing aggregated data |
| `CACHE_COLLECTION_ID`               | Collection ID for caches                                    |
| `LINKS_UPLOADERS_CACHE_DOCUMENT_ID` | Document ID for links uploader cache                        |
| `UPLOADERS_CACHE_DOCUMENT_ID`       | Document ID for uploader cache by subject                   |
| `APPWRITE_NOTE_COLLECTION_ID`       | Collection ID for notes                                     |
| `APPWRITE_FORM_COLLECTION_ID`       | Collection ID for forms                                     |
| `APPWRITE_YOUTUBE_COLLECTION_ID`    | Collection ID for YouTube links                             |

---

## Event Triggers

Enable the function for:

* `databases.*.collections.*.documents.*.create`
* `databases.*.collections.*.documents.*.delete`
* `databases.*.collections.*.documents.*.update` *(only partially used; mostly ignored for stats due to complexity)*

---

## Function Workflow

### 1. Teacher Stats Update

* Increments or decrements stats for a user when they create/delete a document.
* Tracks `notes`, `forms`, `youtube`, and `total` counts.
* Prevents negative counts and sorts stats by total contributions.

### 2. Links Cache Update

* Adds uploader names to a quick-access cache when a new link is uploaded.
* Only updates on document creation.

### 3. Uploader Cache Update

* Adds uploader names to two lists: one global (`all`) and one per subject abbreviation.
* Only updates on note creation events.

---

## Local Development

```bash
npm install
npx functions-emulator start
```

Send a test request:

```bash
curl -X POST http://localhost:3000 \
  -H "x-appwrite-event: databases.main.collections.notes.documents.create" \
  -H "Content-Type: application/json" \
  -d '{"$id":"doc1","userName":"John Doe","abbreviation":"MATH"}'
```

---

## Deployment

1. Zip the function:

```bash
zip -r function.zip .
```

2. Upload to Appwrite Console → Functions → Upload Function.
3. Set runtime to **Node.js 18+**.
4. Configure environment variables.
5. Attach database event triggers.

---

## Error Handling

* Uses `Promise.allSettled` to ensure all tasks run even if one fails.
* Logs detailed error messages in Appwrite console logs.
* Prevents crashes due to missing fields or invalid states.

---

## License

MIT
