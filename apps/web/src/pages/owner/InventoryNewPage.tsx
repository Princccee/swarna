import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'sonner';

const schema = z.object({
  categoryId: z.string().uuid('Select a category'),
  name: z.string().min(2).max(128),
  description: z.string().optional(),
  purity: z.enum(['GOLD_24K', 'GOLD_22K', 'GOLD_18K', 'GOLD_14K', 'SILVER_999', 'SILVER_925', 'PLATINUM_950']),
  grossWeightG: z.coerce.number().positive().transform(String),
  netWeightG: z.coerce.number().positive().transform(String),
  stoneWeightG: z.coerce.number().min(0).transform(String).optional(),
  huid: z.string().regex(/^[A-Z0-9]{6}$/, 'HUID must be 6 alphanumeric chars').optional().or(z.literal('')),
  makingPct: z.coerce.number().min(0).transform(String).optional(),
  makingPerGram: z.coerce.number().min(0).transform(String).optional(),
  stoneValue: z.coerce.number().min(0).transform(String).optional(),
  catalogueVisible: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function InventoryNewPage() {
  const navigate = useNavigate();
  const { data: catData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/inventory/categories').then((r: any) => r.data),
  });

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { makingPct: '0', makingPerGram: '0', stoneWeightG: '0', stoneValue: '0', catalogueVisible: false },
  });

  const mutation = useMutation({
    mutationFn: (data: FormData) => api.post('/inventory/items', data),
    onSuccess: (res: any) => { toast.success('Item created'); navigate(`/owner/inventory/${res.data.id}`); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create item'),
  });

  const Field = ({ label, name, type = 'text', required = false }: { label: string; name: keyof FormData; type?: string; required?: boolean }) => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}{required && <span className="text-red-500 ml-1">*</span>}</label>
      <input type={type} {...register(name as any)} className="w-full border rounded-lg px-3 py-2 text-sm" />
      {errors[name] && <p className="text-red-500 text-xs mt-1">{(errors[name] as any)?.message}</p>}
    </div>
  );

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Add New Item</h1>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="bg-card rounded-xl border p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Category <span className="text-red-500">*</span></label>
          <select {...register('categoryId')} className="w-full border rounded-lg px-3 py-2 text-sm">
            <option value="">Select category</option>
            {(catData ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {errors.categoryId && <p className="text-red-500 text-xs mt-1">{errors.categoryId.message}</p>}
        </div>

        <Field label="Item Name" name="name" required />
        <Field label="Description" name="description" />

        <div>
          <label className="block text-sm font-medium mb-1">Purity <span className="text-red-500">*</span></label>
          <select {...register('purity')} className="w-full border rounded-lg px-3 py-2 text-sm">
            {['GOLD_24K','GOLD_22K','GOLD_18K','GOLD_14K','SILVER_999','SILVER_925','PLATINUM_950'].map((p) => (
              <option key={p} value={p}>{p.replace('_', ' ')}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Gross Weight (g)" name="grossWeightG" type="number" required />
          <Field label="Net Weight (g)" name="netWeightG" type="number" required />
          <Field label="Stone Weight (g)" name="stoneWeightG" type="number" />
          <Field label="Stone Value (₹)" name="stoneValue" type="number" />
          <Field label="Making %" name="makingPct" type="number" />
          <Field label="Making per gram (₹)" name="makingPerGram" type="number" />
        </div>

        <Field label="HUID (6 chars, optional)" name="huid" />

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" {...register('catalogueVisible')} />
          Visible in customer catalogue
        </label>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 border rounded-lg py-2 text-sm">Cancel</button>
          <button type="submit" disabled={mutation.isPending} className="flex-1 bg-amber-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-60">
            {mutation.isPending ? 'Creating…' : 'Create Item'}
          </button>
        </div>
      </form>
    </div>
  );
}
