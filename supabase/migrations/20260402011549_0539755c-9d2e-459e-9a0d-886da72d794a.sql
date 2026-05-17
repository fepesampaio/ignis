
ALTER TABLE public.notifications ADD COLUMN target_role text NULL DEFAULT NULL;

COMMENT ON COLUMN public.notifications.target_role IS 'Role-based filter: aluno, professor, polo, admin, or NULL for user-specific';
