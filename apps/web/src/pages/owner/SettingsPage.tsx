import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../../lib/api';
import { toast } from 'sonner';

type SettingsForm = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  gstin: string;
  stateCode: string;
  isInterstate: 'false' | 'true';
  wastagePercent: string;
  bullionFeedUrl: string;
  irnAutoRegister: boolean;
};

export default function SettingsPage() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<SettingsForm>({
    defaultValues: {
      shopName: '',
      shopAddress: '',
      shopPhone: '',
      gstin: '',
      stateCode: '',
      isInterstate: 'false',
      wastagePercent: '',
      bullionFeedUrl: '',
      irnAutoRegister: false,
    },
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r: any) => r.data),
  });

  useEffect(() => {
    if (!settingsData) return;
    const s = settingsData?.data ?? settingsData;
    reset({
      shopName: s.shopName ?? '',
      shopAddress: s.shopAddress ?? '',
      shopPhone: s.shopPhone ?? '',
      gstin: s.gstin ?? '',
      stateCode: s.stateCode ?? '',
      isInterstate: s.isInterstate === 'true' ? 'true' : 'false',
      wastagePercent: s.wastagePercent ?? '',
      bullionFeedUrl: s.bullionFeedUrl ?? '',
      irnAutoRegister: s.irnAutoRegister === 'true',
    });
  }, [settingsData, reset]);

  const onSubmit = async (values: SettingsForm) => {
    const payload: Record<string, string> = {
      shopName: values.shopName,
      shopAddress: values.shopAddress,
      shopPhone: values.shopPhone,
      gstin: values.gstin,
      stateCode: values.stateCode,
      isInterstate: values.isInterstate,
      wastagePercent: values.wastagePercent,
      bullionFeedUrl: values.bullionFeedUrl,
      irnAutoRegister: values.irnAutoRegister ? 'true' : 'false',
    };

    try {
      await api.patch('/settings', payload);
      toast.success('Settings saved');
    } catch (e: any) {
      toast.error(e?.response?.data?.message ?? 'Failed to save settings');
    }
  };

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Shop Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your shop details, GST preferences, and integrations.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Shop Details */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Shop Details
          </h2>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="shopName">
              Shop Name
            </label>
            <input
              id="shopName"
              {...register('shopName')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. Svarna Jewels"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="shopAddress">
              Shop Address
            </label>
            <textarea
              id="shopAddress"
              {...register('shopAddress')}
              rows={3}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Full address including city and pincode"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="shopPhone">
              Shop Phone
            </label>
            <input
              id="shopPhone"
              {...register('shopPhone')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="e.g. +91 98765 43210"
            />
          </div>
        </section>

        {/* GST Settings */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            GST Configuration
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="gstin">
                GSTIN
              </label>
              <input
                id="gstin"
                {...register('gstin')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="stateCode">
                State Code
              </label>
              <input
                id="stateCode"
                {...register('stateCode')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="e.g. 27"
                maxLength={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">GST Type</p>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="false"
                  {...register('isInterstate')}
                  className="accent-primary"
                />
                Intra-state (CGST + SGST)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="radio"
                  value="true"
                  {...register('isInterstate')}
                  className="accent-primary"
                />
                Inter-state (IGST)
              </label>
            </div>
          </div>
        </section>

        {/* Billing & Rates */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            Billing &amp; Rates
          </h2>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="wastagePercent">
              Wastage %
            </label>
            <input
              id="wastagePercent"
              type="number"
              step="0.01"
              min="0"
              max="100"
              {...register('wastagePercent')}
              className="w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-variant-numeric"
              placeholder="e.g. 3.5"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="bullionFeedUrl">
              Bullion Feed URL
            </label>
            <input
              id="bullionFeedUrl"
              {...register('bullionFeedUrl')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="https://feed.example.com/rates"
            />
            <p className="text-xs text-muted-foreground">
              The endpoint polled for live gold and silver rates.
            </p>
          </div>
        </section>

        {/* E-Invoicing */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
            E-Invoicing
          </h2>

          <label className="flex items-center justify-between cursor-pointer group">
            <div>
              <p className="text-sm font-medium">IRN Auto-Register</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically submit invoices to the IRP and retrieve an IRN on save.
              </p>
            </div>
            <div className="relative ml-4 shrink-0">
              <input
                id="irnAutoRegister"
                type="checkbox"
                {...register('irnAutoRegister')}
                className="sr-only peer"
              />
              <div className="w-10 h-6 rounded-full bg-muted peer-checked:bg-primary transition-colors duration-200 peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2" />
              <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-card shadow transition-transform duration-200 peer-checked:translate-x-4" />
            </div>
          </label>
        </section>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-primary text-primary-foreground px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
