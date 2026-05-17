-- Remove Assinafy-related settings from system_settings
DELETE FROM public.system_settings WHERE key IN ('assinafy_environment', 'contract_template_id');