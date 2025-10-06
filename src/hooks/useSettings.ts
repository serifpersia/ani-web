import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

const fetchSettings = async (key: string) => {
  const response = await fetch(`/api/settings?key=${key}`);
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  const data = await response.json();
  return data.value;
};

const updateSettings = async ({ key, value }: { key: string, value: unknown }) => {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!response.ok) {
    throw new Error('Failed to update settings');
  }
  return response.json();
};

export const useSetting = (key: string) => {
  return useQuery<unknown>({
    queryKey: ['settings', key],
    queryFn: () => fetchSettings(key),
  });
};

export const useUpdateSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('Setting updated!');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      toast.error(`Failed to update setting: ${error.message}`);
    },
  });
};