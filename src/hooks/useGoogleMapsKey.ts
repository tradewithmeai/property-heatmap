import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useGoogleMapsKey() {
  const [apiKey, setApiKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApiKey = async () => {
      try {
        // Try to get API key from environment variable first
        const envApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        console.log('Environment API key check:', { 
          hasEnvKey: !!envApiKey, 
          envKeyPrefix: envApiKey ? envApiKey.substring(0, 10) : 'none' 
        });
        
        if (envApiKey) {
          setApiKey(envApiKey);
          setLoading(false);
          return;
        }

        // Fallback to Supabase function
        console.log('Attempting Supabase function fallback...');
        const { data, error } = await supabase.functions.invoke('get-maps-key');
        
        console.log('Supabase function response:', { data, error });
        
        if (error) throw error;
        
        if (data?.apiKey) {
          setApiKey(data.apiKey);
        } else {
          throw new Error('No API key available. Please set VITE_GOOGLE_MAPS_API_KEY environment variable or configure the Supabase edge function.');
        }
      } catch (err) {
        console.error('API key fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch API key');
      } finally {
        setLoading(false);
      }
    };

    fetchApiKey();
  }, []);

  return { apiKey, loading, error };
}