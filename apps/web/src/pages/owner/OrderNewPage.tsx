import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../../lib/api';

const PURITY_OPTIONS = [
  'GOLD_24K',
  'GOLD_22K',
  'GOLD_18K',
  'GOLD_14K',
  'SILVER_999',
  'SILVER_925',
  'PLATINUM_950',
] as const;

const schema = z.object({
  customerId: z.string().uuid('Select a customer'),
  type: z.enum(['PRE_ORDER', 'CUSTOM', 'REPAIR']),
  description: z.string().min(1, 'Description is required'),
  metalPurity: z.enum(PURITY_OPTIONS).optional(),
  estimatedWeightG: z.coerce.number().min(0).optional().or(z.literal('')),
  estimatedValue: z.coerce.number().min(0).optional().or(z.literal('')),
  advancePaid: z.coerce.number().min(0).optional().or(z.literal('')),
  expectedReady: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Customer {
  id: string;
  name: string;
  phone: string;
}

export default function OrderNewPage() {
  const navigate = useNavigate();
  const [customerSearch, setCustomerSearch] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { advancePaid: 0 },
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function handleCustomerSearch(value: string) {
    setCustomerSearch(value);
    setSelectedCustomer(null);
    setValue('customerId', '' as any);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setCustomers([]);
      setDropdownOpen(false);
      return;
    }

    searchTimeout.current = setTimeout(() => {
      setSearching(true);
      api
        .get('/billing/customers', { params: { search: value } })
        .then((r: any) => {
          setCustomers(r.data?.data ?? r.data ?? []);
          setDropdownOpen(true);
        })
        .catch(() => setCustomers([]))
        .finally(() => setSearching(false));
    }, 300);
  }

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setCustomerSearch(customer.name);
    setValue('customerId', customer.id, { shouldValidate: true });
    setDropdownOpen(false);
    setCustomers([]);
  }

  async function onSubmit(data: FormData) {
    setSubmitting(true);
    const payload: Record<string, any> = {
      customerId: data.customerId,
      type: data.type,
      description: data.description,
    };
    if (data.metalPurity) payload.metalPurity = data.metalPurity;
    if (data.estimatedWeightG !== '' && data.estimatedWeightG !== undefined)
      payload.estimatedWeightG = Number(data.estimatedWeightG);
    if (data.estimatedValue !== '' && data.estimatedValue !== undefined)
      payload.estimatedValue = Number(data.estimatedValue);
    if (data.advancePaid !== '' && data.advancePaid !== undefined)
      payload.advancePaid = Number(data.advancePaid);
    if (data.expectedReady) payload.expectedReady = data.expectedReady;
    if (data.notes) payload.notes = data.notes;

    api
      .post('/orders', payload)
      .then((r: any) => {
        toast.success('Order created');
        navigate(`/owner/orders/${r.data.id}`);
      })
      .catch((e: any) => {
        toast.error(e?.response?.data?.message ?? 'Failed to create order');
        setSubmitting(false);
      });
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">New Order</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create a pre-order, custom job, or repair request
        </p>
      </div>

      <form
        onSubmit={handleSubmit(onSubmit)}
        className="bg-card border rounded-xl p-6 shadow-sm space-y-5"
      >
        {/* Customer search */}
        <div ref={dropdownRef} className="relative">
          <label className="block text-sm font-medium mb-1">
            Customer <span className="text-destructive">*</span>
          </label>
          <input
            type="text"
            value={customerSearch}
            onChange={(e) => handleCustomerSearch(e.target.value)}
            placeholder="Search by name or phone…"
            autoComplete="off"
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {searching && (
            <span className="absolute right-3 top-[2.1rem] text-xs text-muted-foreground">
              Searching…
            </span>
          )}
          {dropdownOpen && customers.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-md overflow-hidden max-h-52 overflow-y-auto">
              {customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => selectCustomer(c)}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted flex items-center justify-between"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-muted-foreground text-xs">{c.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {dropdownOpen && customers.length === 0 && !searching && customerSearch.trim() && (
            <div className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-md px-3 py-2.5 text-sm text-muted-foreground">
              No customers found
            </div>
          )}
          {/* Hidden field for RHF validation */}
          <input type="hidden" {...register('customerId')} />
          {selectedCustomer && (
            <p className="text-xs text-primary mt-1 font-medium">
              Selected: {selectedCustomer.name} ({selectedCustomer.phone})
            </p>
          )}
          {errors.customerId && (
            <p className="text-destructive text-xs mt-1">{errors.customerId.message}</p>
          )}
        </div>

        {/* Order Type */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Order Type <span className="text-destructive">*</span>
          </label>
          <select
            {...register('type')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Select type</option>
            <option value="PRE_ORDER">Pre-Order</option>
            <option value="CUSTOM">Custom</option>
            <option value="REPAIR">Repair</option>
          </select>
          {errors.type && (
            <p className="text-destructive text-xs mt-1">{errors.type.message}</p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Description <span className="text-destructive">*</span>
          </label>
          <textarea
            {...register('description')}
            rows={3}
            placeholder="Describe the item or job…"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          {errors.description && (
            <p className="text-destructive text-xs mt-1">{errors.description.message}</p>
          )}
        </div>

        {/* Metal Purity */}
        <div>
          <label className="block text-sm font-medium mb-1">Metal Purity</label>
          <select
            {...register('metalPurity')}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">Select purity (optional)</option>
            {PURITY_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Numeric fields grid */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Est. Weight (g)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register('estimatedWeightG')}
              placeholder="0.00"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {errors.estimatedWeightG && (
              <p className="text-destructive text-xs mt-1">{errors.estimatedWeightG.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Est. Value (₹)</label>
            <input
              type="number"
              step="1"
              min="0"
              {...register('estimatedValue')}
              placeholder="0"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {errors.estimatedValue && (
              <p className="text-destructive text-xs mt-1">{errors.estimatedValue.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Advance Paid (₹)</label>
            <input
              type="number"
              step="1"
              min="0"
              {...register('advancePaid')}
              placeholder="0"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            {errors.advancePaid && (
              <p className="text-destructive text-xs mt-1">{errors.advancePaid.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Expected Ready</label>
            <input
              type="date"
              {...register('expectedReady')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium mb-1">Notes</label>
          <textarea
            {...register('notes')}
            rows={2}
            placeholder="Internal notes (optional)…"
            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex-1 border rounded-lg py-2 text-sm hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 bg-amber-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-60"
          >
            {submitting ? 'Creating…' : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
