import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SystemSetting {
  id: string;
  key: string;
  value: unknown;
  category: string;
  description: string | null;
}

interface SystemSettings {
  platform_name: string;
  platform_logo_url: string;
  platform_primary_color: string;
  platform_secondary_color: string;
  certificate_institution_name: string;
  certificate_logo_url: string;
  certificate_signatory_name: string;
  certificate_signatory_title: string;
}

const defaultSettings: SystemSettings = {
  platform_name: 'Instituto Ignis',
  platform_logo_url: 'https://i.ibb.co/wF8KhQCN/sem-fundo.png',
  platform_primary_color: '#6366f1',
  platform_secondary_color: '#8b5cf6',
  certificate_institution_name: 'Instituto Ignis',
  certificate_logo_url: '',
  certificate_signatory_name: '',
  certificate_signatory_title: '',
};

export function useSystemSettings() {
  const { data: settings, isLoading } = useQuery({
    queryKey: ['system-settings-public'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('system_settings')
        .select('key, value');
      
      if (error) {
        console.error('Error fetching system settings:', error);
        return defaultSettings;
      }

      const settingsMap: Record<string, unknown> = { ...defaultSettings };
      
      data?.forEach((setting: { key: string; value: unknown }) => {
        try {
          const value = typeof setting.value === 'string' 
            ? JSON.parse(setting.value) 
            : setting.value;
          settingsMap[setting.key] = value;
        } catch {
          settingsMap[setting.key] = setting.value;
        }
      });

      return settingsMap as unknown as SystemSettings;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  return {
    settings: settings || defaultSettings,
    isLoading,
  };
}