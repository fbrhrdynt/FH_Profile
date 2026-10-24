# Febro Files integration contract — Portfolio and Certifications

This repository is the source for febro.id, deployed from /opt/febro. The existing Node.js/SQLite CMS must retain all records, sessions, and uploads. Febro Files is a **different running application** and is not present in this repository. Do not presume its internal upload endpoints, token model, or storage schema.

## Scope

The unified Media & Attachments section supports all CMS content kinds, particularly:
- Projects: cover, gallery (multiple), supporting documents
- Certifications: certificate PDF, scans, credential image and supporting documents
- Blog posts, experiences, education, tools: attachments (subject to content-specific display policy)
- Site settings: existing avatar remains untouched; a future media linkage can be additive

Each attachment has: stable remote file ID, source application, entry ID/kind, role (cover/gallery/document/certificate), original name, content type, bytes, checksum, caption, sort order, visibility (private/public/unlisted), allow_preview and allow_download. Everything is **private by default**. A content record being public does not automatically publish attachments.

## Required Febro Files contract

Implement or validate a service-to-service API on files.febro.id, scoped to the application `febro-profile`, using a dedicated secret stored only in process environment. No user credentials may be forwarded and no global Febro Files owner token may be embedded in the frontend.

Suggested contract (not yet implemented or verified):

- `POST /api/integrations/v1/files` (multipart file, logical folder, visibility private) -> remote file ID
- `GET /api/integrations/v1/files/:id` -> metadata
- `GET /api/integrations/v1/files/:id/content` -> streamed content; app-scoped, authenticated
- `DELETE /api/integrations/v1/files/:id` -> idempotent delete; scoped
- Optional signed public preview grants with short TTL; never publicly expose private file URLs.

Until the actual Febro Files repository is audited and a corresponding implementation is deployed, **do not advertise file upload as working**. Do not quietly store sensitive content in a publicly readable folder or return fake remote IDs.

## Data preservation

Create the `entry_files` table additively only; do not drop or recreate existing tables:

```sql
CREATE TABLE IF NOT EXISTS entry_files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 entry_id INTEGER NOT NULL REFERENCES entries(id) ON DELETE RESTRICT,
 remote_id TEXT NOT NULL UNIQUE,
 role TEXT NOT NULL CHECK(role IN ('cover','gallery','document','certificate','attachment')),
 original_name TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL,
 sha256 TEXT NOT NULL DEFAULT '',
 caption TEXT NOT NULL DEFAULT '',
 visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('public','unlisted','private')),
 allow_preview INTEGER NOT NULL DEFAULT 0,
 allow_download INTEGER NOT NULL DEFAULT 0,
 sort_order INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_entry_files_entry ON entry_files(entry_id,sort_order,id);
```

Do not enable file uploads in production until both applications' services are verified. Before any migration, take and verify backup of SQLite plus both services' existing file objects and metadata. Coordinate deletion: delete content references first only after confirming remote object lifecycle; never cascade to silent remote deletion. Preserve historical files and references.

## Security requirements

- Only authenticated CMS admins can upload, change access, reorder and delete.
- CSRF protection on browser mutations; token not stored in frontend.
- Validate input MIME and signatures, allowlisted formats (JPEG/PNG/WebP/PDF, and optionally DOCX/XLSX/PPTX) with size and quota limits.
- Stream data with backpressure. Avoid buffering multi-MB content in memory.
- Febro Files must enforce app-scoped ownership and permissions on every request.
- Public endpoints must check *both* parent content visibility and file visibility.
- `unlisted` is not secure enough for confidential company documentation.
- "Preview only" cannot guarantee preventing client-side saving/screenshot.
- Private internal work documents should stay private unless owner has publication clearance.
- Add tests for fail-closed behavior and orphan cleanup, including partial network failures.

## Deployment acceptance gates

1. Real API endpoints and auth scheme are confirmed from running Febro Files source.
2. Remote service credentials configured safely in both applications, no tokens in Git.
3. End-to-end upload, private fetch, public preview, and denied download verified.
4. Existing certification records count and document file references preserved.
5. Backup/rollback procedure tested on staging.
6. Only then merge integration code and deploy to febro.id and files.febro.id.

**Status:** Architecture and schema contract only, not a functioning cross-service integration. Do not deploy as if complete.
