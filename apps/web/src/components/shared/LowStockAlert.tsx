import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

export function LowStockAlert() {
  const { data } = useQuery({
    queryKey: ['lowStockCount'],
    queryFn: () => api.get('/inventory/items?lowStock=true&limit=1').then((r: any) => r.data.meta?.total ?? 0),
    refetchInterval: 60_000,
  });

  const count = data ?? 0;
  if (count === 0) return null;

  return (
    <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
      {count > 99 ? '99+' : count}
    </span>
  );
}
