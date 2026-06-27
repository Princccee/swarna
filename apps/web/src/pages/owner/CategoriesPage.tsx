import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '../../lib/api';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().min(2).max(64),
  visible: z.boolean(),
  sortOrder: z.coerce.number().int().min(0),
});
type FormData = z.infer<typeof schema>;

export default function CategoriesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/inventory/categories').then((r: any) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (d: FormData) => api.post('/inventory/categories', d),
    onSuccess: () => { toast.success('Category created'); qc.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: FormData & { id: string }) => api.patch(`/inventory/categories/${id}`, d),
    onSuccess: () => { toast.success('Category updated'); qc.invalidateQueries({ queryKey: ['categories'] }); setEditing(null); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/inventory/categories/${id}`),
    onSuccess: () => { toast.success('Category deleted'); qc.invalidateQueries({ queryKey: ['categories'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Cannot delete — has active items'),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { visible: true, sortOrder: 0 },
  });

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">Categories</h1>

      {/* Create form */}
      <form onSubmit={handleSubmit((d) => { createMutation.mutate(d); reset(); })}
        className="bg-card rounded-xl border p-5 space-y-3">
        <h2 className="font-semibold">Add Category</h2>
        <div className="flex gap-3">
          <input {...register('name')} placeholder="Category name" className="flex-1 border rounded-lg px-3 py-2 text-sm" />
          <input {...register('sortOrder')} type="number" placeholder="Order" className="w-20 border rounded-lg px-3 py-2 text-sm" />
          <label className="flex items-center gap-1 text-sm"><input type="checkbox" {...register('visible')} /> Visible</label>
          <button type="submit" disabled={createMutation.isPending} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Add
          </button>
        </div>
        {errors.name && <p className="text-red-500 text-xs">{errors.name.message}</p>}
      </form>

      {/* Category list */}
      <div className="bg-card rounded-xl border divide-y">
        {isLoading && <div className="p-4 text-muted-foreground/60">Loading…</div>}
        {categories.map((cat: any) => (
          <div key={cat.id} className="p-4 flex items-center justify-between">
            {editing === cat.id ? (
              <EditForm
                cat={cat}
                onSave={(d) => updateMutation.mutate({ id: cat.id, ...d })}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div>
                  <p className="font-medium">{cat.name}</p>
                  <p className="text-xs text-muted-foreground/60">{cat.slug} · {cat._count?.items ?? 0} items</p>
                </div>
                <div className="flex items-center gap-2">
                  {!cat.visible && <span className="text-xs text-muted-foreground/60 bg-muted px-2 py-0.5 rounded">Hidden</span>}
                  <button onClick={() => setEditing(cat.id)} className="text-sm text-amber-600 hover:underline">Edit</button>
                  <button onClick={() => deleteMutation.mutate(cat.id)} className="text-sm text-red-500 hover:underline">Delete</button>
                </div>
              </>
            )}
          </div>
        ))}
        {!isLoading && categories.length === 0 && (
          <div className="p-4 text-muted-foreground/60 text-sm">No categories yet</div>
        )}
      </div>
    </div>
  );
}

function EditForm({ cat, onSave, onCancel }: { cat: any; onSave: (d: any) => void; onCancel: () => void }) {
  const { register, handleSubmit } = useForm({ defaultValues: { name: cat.name, visible: cat.visible, sortOrder: cat.sortOrder } });
  return (
    <form onSubmit={handleSubmit(onSave)} className="flex items-center gap-2 w-full">
      <input {...register('name')} className="flex-1 border rounded px-2 py-1 text-sm" />
      <input {...register('sortOrder')} type="number" className="w-16 border rounded px-2 py-1 text-sm" />
      <label className="text-sm flex items-center gap-1"><input type="checkbox" {...register('visible')} /> Visible</label>
      <button type="submit" className="text-sm text-amber-600">Save</button>
      <button type="button" onClick={onCancel} className="text-sm text-muted-foreground/60">Cancel</button>
    </form>
  );
}
