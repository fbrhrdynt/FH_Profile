# Febro Files — verified staging API and rollout

The uploaded Oct 24 Febro Files staging source was reviewed. The staging server implements:
- `POST /api/integrations/v1/files?kind=project&entry=123&name=cover.png` with raw octet-stream, known content length.
- `GET /api/integrations/v1/files/:id` for metadata.
- `GET /api/integrations/v1/files/:id/preview` and `/download` for streaming.
- `DELETE /api/integrations/v1/files/:id` to move the object to Trash.
- Authorization: `Bearer <FEBRO_PROFILE_SERVICE_TOKEN>` with a 48+ character secret configured in both servers' environment, never browser-side.
- Folder hierarchy: `Applications/febro.id/<kind>/<entry-id>`.

This API exists in **staging source only**, not proven deployed on files.febro.id. The staging ZIP is NOT a complete Febro Files deployment; its backend patch lacks file signature validation and integration tests.

## Implementation boundaries

The Febro Files server is installed on VPS at `/opt/febro-files` and its Git remote is empty. This repository is only the `/opt/febro` website. Do not replace or overwrite the Febro Files installation with the staging ZIP, and do not merge the CMS branch before end-to-end tests.

A proper CMS uploader must:
1. Authenticate the current CMS admin and validate CSRF.
2. Validate file signatures, sizes and content types before forwarding a bounded streaming request to Febro Files.
3. Create a unique storage name while retaining the display name.
4. Store the returned remote ID in `entry_files` with visibility `private` and both public permissions off by default.
5. Proxy preview/download server-side after checking entry publication and file-level access. Never expose the service token to the client.
6. Support roles `cover`, `gallery`, `document`, `certificate`, `attachment` for every CMS kind, including certification.
7. Reconcile remote uploads when local database insert fails, and avoid destructive deletes on network errors.
8. Verify migration and rollback with copies of both SQLite databases and storage.
9. Add end-to-end tests with both services before release.

## Rollout status

- [x] CMS additive attachment table in feature branch
- [x] Prevent deleting entries with linked remote file metadata
- [x] Verified Febro Files staging API contract from user-supplied source
- [ ] Validate file signatures in Febro Files integration API
- [ ] Implement CMS upload/editor UI for all kinds
- [ ] Add complete access control and proxy
- [ ] Test full round trip, errors, private access and cleanup
- [ ] Push full Febro Files source to its own repository (not yet linked)
- [ ] Production backup, deploy, smoke tests

**Do not deploy as complete.**
