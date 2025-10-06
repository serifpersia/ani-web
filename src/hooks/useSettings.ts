import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const fetchSettings = async (key: string) => {
  const response = await fetch(`/api/settings?key=${key}`);
  if (!response.ok) {
    throw new Error('Failed to fetch settings');
  }
  const data = await response.json();
  return data.value;
};

const updateSettings = async ({ key, value }: { key: string, value: any }) => {
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
  return useQuery<any>({
    queryKey: ['settings', key],
    queryFn: () => fetchSettings(key),
  });
};

export const useUpdateSetting = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSettings,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['settings', variables.key] });
    },
  });
};
