import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { toast } from 'sonner';

const schema = z.object({
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT']),
  qty: z.coerce.number().int().min(1),
  reason: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  itemId: string;
  itemName: string;
  currentQty: number;
  onClose: () => void;
}

export function StockMovementDrawer({ itemId, itemName, currentQty, onClose }: Props) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'IN', qty: 1 },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post(`/inventory/items/${itemId}/stock`, data),
    onSuccess: () => {
      toast.success('Stock updated');
      qc.invalidateQueries({ queryKey: ['item', itemId] });
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to update stock'),
  });

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white w-full max-w-sm p-6 shadow-xl flex flex-col gap-5">
        <div>
          <h2 className="text-lg font-semibold">Adjust Stock</h2>
          <p className="text-sm text-gray-500">{itemName} — Current: <strong>{currentQty}</strong></p>
        </div>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Movement Type</label>
            <select {...register('type')} className="w-full border rounded-md px-3 py-2 text-sm">
              <option value="IN">Stock In</option>
              <option value="OUT">Stock Out</option>
              <option value="ADJUSTMENT">Manual Adjustment</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input type="number" {...register('qty')} className="w-full border rounded-md px-3 py-2 text-sm" />
            {errors.qty && <p className="text-red-500 text-xs mt-1">{errors.qty.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Reason (optional)</label>
            <input {...register('reason')} className="w-full border rounded-md px-3 py-2 text-sm" placeholder="e.g. received from supplier" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 border rounded-md py-2 text-sm">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="flex-1 bg-amber-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-60">
              {mutation.isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
