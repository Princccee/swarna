import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { api } from '../../lib/api';
import { toast } from 'sonner';

type SettingsForm = {
  shopName: string;
  shopAddress: string;
  shopPhone: string;
  whatsappNumber: string;
  gstin: string;
  stateCode: string;
  isInterstate: 'false' | 'true';
  wastagePercent: string;
  goldApiKey: string;
  metalsDevApiKey: string;
  goldPremiumPer10g: string;
  silverPremiumPer10g: string;
  rateMaxChangePct: string;
  lendingLtvPct: string;
  lendingMaxLtvPct: string;
  lendingInterestPctMonthly: string;
  lendingOverdueMonths: string;
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
      whatsappNumber: '',
      gstin: '',
      stateCode: '',
      isInterstate: 'false',
      wastagePercent: '',
      goldApiKey: '',
      metalsDevApiKey: '',
      goldPremiumPer10g: '0',
      silverPremiumPer10g: '0',
      rateMaxChangePct: '3',
      lendingLtvPct: '65',
      lendingMaxLtvPct: '70',
      lendingInterestPctMonthly: '2',
      lendingOverdueMonths: '12',
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
      whatsappNumber: s.whatsappNumber ?? '',
      gstin: s.gstin ?? '',
      stateCode: s.stateCode ?? '',
      isInterstate: s.isInterstate === 'true' ? 'true' : 'false',
      wastagePercent: s.wastagePercent ?? '',
      goldApiKey: s.goldApiKey ?? '',
      metalsDevApiKey: s.metalsDevApiKey ?? '',
      goldPremiumPer10g: s.goldPremiumPer10g ?? '0',
      silverPremiumPer10g: s.silverPremiumPer10g ?? '0',
      rateMaxChangePct: s.rateMaxChangePct ?? '3',
      lendingLtvPct: s.lendingLtvPct ?? '65',
      lendingMaxLtvPct: s.lendingMaxLtvPct ?? '70',
      lendingInterestPctMonthly: s.lendingInterestPctMonthly ?? '2',
      lendingOverdueMonths: s.lendingOverdueMonths ?? '12',
      irnAutoRegister: s.irnAutoRegister === 'true',
    });
  }, [settingsData, reset]);

  const onSubmit = async (values: SettingsForm) => {
    const payload: Record<string, string> = {
      shopName: values.shopName,
      shopAddress: values.shopAddress,
      shopPhone: values.shopPhone,
      whatsappNumber: values.whatsappNumber,
      gstin: values.gstin,
      stateCode: values.stateCode,
      isInterstate: values.isInterstate,
      wastagePercent: values.wastagePercent,
      goldApiKey: values.goldApiKey,
      metalsDevApiKey: values.metalsDevApiKey.trim(),
      goldPremiumPer10g: String(values.goldPremiumPer10g || '0'),
      silverPremiumPer10g: String(values.silverPremiumPer10g || '0'),
      rateMaxChangePct: String(values.rateMaxChangePct || '3'),
      lendingLtvPct: String(values.lendingLtvPct || '65'),
      lendingMaxLtvPct: String(values.lendingMaxLtvPct || '70'),
      lendingInterestPctMonthly: String(values.lendingInterestPctMonthly || '2'),
      lendingOverdueMonths: String(values.lendingOverdueMonths || '12'),
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

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="whatsappNumber">
              WhatsApp Number
            </label>
            <input
              id="whatsappNumber"
              {...register('whatsappNumber')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Leave blank to use the shop phone"
            />
            <p className="text-xs text-muted-foreground">
              The number customers message for automatic replies (RATES, NEW). Printed on Share Kit images.
            </p>
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

        </section>

        {/* Live rates */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
              Live Rates
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              Daily IBJA gold and MCX silver benchmark rates from metals.dev (free plan), plus your local premium.
              Fetched at 10:00, 13:00 and 17:30 IST, Monday to Saturday. Check and override them on the Rates page.
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="metalsDevApiKey">
              metals.dev API Key
            </label>
            <input
              id="metalsDevApiKey"
              type="password"
              autoComplete="off"
              {...register('metalsDevApiKey')}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
              placeholder="Paste the key from metals.dev → Dashboard"
            />
            <p className="text-xs text-muted-foreground">
              Sign up free at metals.dev. The free plan allows 100 requests a month; the app uses about 80.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="goldPremiumPer10g">
                Gold premium (₹ per 10 g)
              </label>
              <input
                id="goldPremiumPer10g"
                type="number"
                step="1"
                {...register('goldPremiumPer10g')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                placeholder="0"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="silverPremiumPer10g">
                Silver premium (₹ per 10 g)
              </label>
              <input
                id="silverPremiumPer10g"
                type="number"
                step="0.1"
                {...register('silverPremiumPer10g')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            Added to the 999 benchmark to match the Patna market. Lower purities get their share automatically
            (22K = 91.6%, 18K = 75%). Compare with the local rate for a few days and adjust. It can be negative.
          </p>

          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="rateMaxChangePct">
              Hold for approval if rates move more than (%)
            </label>
            <input
              id="rateMaxChangePct"
              type="number"
              step="0.5"
              min="0.5"
              {...register('rateMaxChangePct')}
              className="w-40 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums"
            />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Alternative: goldapi.io (not recommended)</summary>
            <div className="space-y-1 mt-3">
              <label className="text-sm font-medium" htmlFor="goldApiKey">
                goldapi.io API Key
              </label>
              <input
                id="goldApiKey"
                type="password"
                autoComplete="off"
                {...register('goldApiKey')}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring font-mono"
                placeholder="goldapi-xxxxxxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Used only if no metals.dev key is set. This is the international spot price without Indian import duty,
                so it reads lower than local market rates.
              </p>
            </div>
          </details>
        </section>

        {/* Lending */}
        <section className="bg-card rounded-xl border p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">Lending (Girvi)</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Defaults for new loans. Existing loans keep the interest rate they were given at.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="lendingLtvPct">Suggested loan (% of value)</label>
              <input id="lendingLtvPct" type="number" step="1" min="1" max="100" {...register('lendingLtvPct')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="lendingMaxLtvPct">Maximum loan (% of value)</label>
              <input id="lendingMaxLtvPct" type="number" step="1" min="1" max="100" {...register('lendingMaxLtvPct')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="lendingInterestPctMonthly">Interest (% per month)</label>
              <input id="lendingInterestPctMonthly" type="number" step="0.05" min="0.05" {...register('lendingInterestPctMonthly')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums" />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="lendingOverdueMonths">Overdue after (months)</label>
              <input id="lendingOverdueMonths" type="number" step="1" min="1" {...register('lendingOverdueMonths')} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring tabular-nums" />
            </div>
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
