-- ============================================================================
-- PRABAS Food Planner · 0003 Drive backup status
--
-- Only the backup owner's phone talks to Google Drive, but every member should
-- see when the household was last backed up. The owner's app records it here.
-- ============================================================================

alter table public.households add column drive_backup_at timestamptz;

-- Members may update it, like the name (RLS still limits them to their own household).
grant update (drive_backup_at) on public.households to authenticated;
