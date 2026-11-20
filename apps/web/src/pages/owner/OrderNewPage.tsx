import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { api } from '../../lib/api';
import { uploadImages } from '../../lib/images';
import { ImagePicker, PhotoGrid, usePendingPhotos } from '../../components/shared/ImagePicker';

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
  const photos = usePendingPhotos();
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

  // ── New customer (same as POS): saved first, then selected for this order ──
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', phone: '', address: '' });
  const [savingCustomer, setSavingCustomer] = useState(false);

  function openNewCustomer() {
    // Pre-fill from what was searched: digits → mobile, anything else → name
    const q = customerSearch.trim();
    const digits = q.replace(/\D/g, '');
    setNewCustomer({
      name: digits.length >= 6 ? '' : q,
      phone: digits.length >= 6 ? digits.slice(-10) : '',
      address: '',
    });
    setDropdownOpen(false);
    setShowNewCustomer(true);
  }

  function saveNewCustomer() {
    const name = newCustomer.name.trim();
    const phone = newCustomer.phone.trim();
    if (name.length < 2) {
      toast.error("Enter the customer's name");
      return;
    }
    if (!/^[6-9]\d{9}$/.test(phone)) {
      toast.error('Enter a valid 10-digit mobile number');
      return;
    }
    setSavingCustomer(true);
    api
      .post('/billing/customers', { name, phone, ...(newCustomer.address.trim() ? { address: newCustomer.address.trim() } : {}) })
      .then((r: any) => {
        const c = r.data?.data ?? r.data;
        selectCustomer({ id: c.id, name: c.name, phone: c.phone });
        setShowNewCustomer(false);
        toast.success(`Customer "${c.name}" added`);
      })
      .catch((err: any) => {
        // Phone already registered: use that customer instead of creating a duplicate
        const existing = err?.response?.status === 409 ? err.response.data?.customer : null;
        if (existing) {
          selectCustomer({ id: existing.id, name: existing.name, phone: existing.phone });
          setShowNewCustomer(false);
          toast.info(`${existing.name} is already registered with this phone. Selected.`);
          return;
        }
        const m = err?.response?.data?.message;
        toast.error('Failed to add customer', { description: Array.isArray(m) ? m.join(', ') : m ?? 'Please try again.' });
      })
      .finally(() => setSavingCustomer(false));
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
      .then(async (r: any) => {
        const id = r.data.id;
        if (photos.files.length) {
          try {
            await uploadImages(`/orders/${id}/images`, photos.files);
          } catch (e: any) {
            // The order is saved; photos can be added again from its page
            toast.error(e?.response?.data?.message ?? 'Order saved, but the design photos could not be uploaded — add them again');
            navigate(`/owner/orders/${id}`);
            return;
          }
        }
        toast.success('Order created');
        navigate(`/owner/orders/${id}`);
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
            <div className="absolute z-20 mt-1 w-full bg-card border rounded-lg shadow-md px-3 py-2.5 text-sm text-muted-foreground flex items-center justify-between gap-2">
              <span>No customers found</span>
              <button type="button" onClick={openNewCustomer} className="text-primary font-medium hover:underline">
                + Add as new customer
              </button>
            </div>
          )}

          {!selectedCustomer && !showNewCustomer && (
            <button
              type="button"
              onClick={openNewCustomer}
              className="mt-2 text-sm font-medium text-primary hover:underline"
            >
              + New customer
            </button>
          )}

          {/* New customer — a section, not a nested <form> (this sits inside the order form) */}
          {showNewCustomer && (
            <div className="mt-3 rounded-lg border bg-muted/30 p-4 space-y-3">
              <p className="text-sm font-semibold">New customer</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={newCustomer.name}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
                    placeholder="Full name"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-card"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Mobile <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value.replace(/\D/g, '') }))}
                    placeholder="10-digit mobile"
                    className="w-full border rounded-lg px-3 py-2 text-sm bg-card"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Address (optional)</label>
                <input
                  type="text"
                  value={newCustomer.address}
                  onChange={(e) => setNewCustomer((c) => ({ ...c, address: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-card"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveNewCustomer}
                  disabled={savingCustomer}
                  className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                >
                  {savingCustomer ? 'Saving…' : 'Save & Select'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewCustomer(false)}
                  className="border rounded-lg px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
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

        {/* Design photos — what the customer wants made (camera or gallery) */}
        <div>
          <label className="block text-sm font-medium mb-2">Design photos</label>
          <ImagePicker onPick={photos.add} disabled={submitting} />
          <div className="mt-3">
            <PhotoGrid urls={photos.previews} alt="Design photo" onRemove={photos.removeAt} />
          </div>
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
            {submitting ? (photos.files.length ? 'Saving & uploading photos…' : 'Creating…') : 'Create Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
