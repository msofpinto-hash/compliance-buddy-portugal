-- Drop and recreate the audit_status enum with new values
ALTER TYPE audit_status RENAME TO audit_status_old;

CREATE TYPE audit_status AS ENUM ('planned', 'in_progress', 'pending_approval', 'closed', 'cancelled');

-- Update the column to use new type
ALTER TABLE audits 
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE audit_status USING (
    CASE 
      WHEN status::text = 'completed' THEN 'closed'::audit_status
      ELSE status::text::audit_status
    END
  ),
  ALTER COLUMN status SET DEFAULT 'planned'::audit_status;

-- Add approved_by and approved_at columns for tracking approval
ALTER TABLE audits 
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

-- Drop old enum
DROP TYPE audit_status_old;

-- Add RLS policy for clients to update audits (for approval)
CREATE POLICY "Clients can approve their audits"
ON audits
FOR UPDATE
USING (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND status = 'pending_approval'::audit_status
)
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND status = 'closed'::audit_status
);