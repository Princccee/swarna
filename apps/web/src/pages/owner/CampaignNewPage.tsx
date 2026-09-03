import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  MessageSquare,
  Users,
  CalendarClock,
  Loader2,
  Tag,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Template {
  id: string;
  displayName: string;
  bodyText: string;
  variables: string[];
}

type ScheduleType = 'ONCE' | 'DAILY' | 'WEEKLY';

type AudienceMode = 'ALL' | 'FILTERED';

interface AudienceFilter {
  minPurchases?: 1;
  minSpent?: number;
}

interface CampaignPayload {
  name: string;
  templateId: string;
  scheduleType: ScheduleType;
  scheduledAt?: string;
  audienceFilter: AudienceFilter;
}

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

const STEPS = [
  { label: 'Template', icon: MessageSquare },
  { label: 'Audience', icon: Users },
  { label: 'Schedule', icon: CalendarClock },
];

function StepIndicator({ current }: { current: number }) {
  return (
    <nav className="flex items-center gap-0 mb-8">
      {STEPS.map((step, idx) => {
        const done = idx < current;
        const active = idx === current;
        const Icon = step.icon;
        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={[
                  'w-9 h-9 rounded-full flex items-center justify-center border-2 transition-colors',
                  done
                    ? 'bg-amber-600 border-amber-600 text-white'
                    : active
                    ? 'border-amber-600 text-amber-600 bg-amber-50'
                    : 'border-zinc-300 text-zinc-400 bg-white',
                ].join(' ')}
              >
                {done ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Icon className="w-4 h-4" />
                )}
              </div>
              <span
                className={[
                  'text-xs font-medium tracking-wide',
                  active ? 'text-amber-700' : done ? 'text-amber-600' : 'text-zinc-400',
                ].join(' ')}
              >
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  'h-px w-16 sm:w-24 mx-2 mb-4 transition-colors',
                  idx < current ? 'bg-amber-500' : 'bg-zinc-200',
                ].join(' ')}
              />
            )}
          </div>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — Template picker
// ---------------------------------------------------------------------------

function TemplateStep({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ['campaign-templates'],
    queryFn: () => api.get('/campaigns/templates').then((r: any) => r.data.data ?? r.data),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Loading templates…
      </div>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="text-sm text-zinc-500 py-8 text-center">
        No approved templates found. Add a template from WhatsApp Business Manager first.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500 mb-4">
        Select a WhatsApp message template to use for this campaign.
      </p>
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          className={[
            'w-full text-left rounded-xl border-2 p-4 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500',
            selectedId === t.id
              ? 'border-amber-500 bg-amber-50'
              : 'border-zinc-200 bg-white hover:border-zinc-300',
          ].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-zinc-800 text-sm">{t.displayName}</p>
              <p className="text-xs text-zinc-500 mt-1 leading-relaxed line-clamp-3">
                {t.bodyText}
              </p>
            </div>
            {selectedId === t.id && (
              <CheckCircle2 className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            )}
          </div>
          {t.variables && t.variables.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {t.variables.map((v) => (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-800 rounded-full px-2 py-0.5 font-medium"
                >
                  <Tag className="w-2.5 h-2.5" />
                  {v}
                </span>
              ))}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Audience
// ---------------------------------------------------------------------------

function AudienceStep({
  mode,
  filter,
  onModeChange,
  onFilterChange,
}: {
  mode: AudienceMode;
  filter: AudienceFilter;
  onModeChange: (m: AudienceMode) => void;
  onFilterChange: (f: AudienceFilter) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Choose who should receive this campaign.
      </p>

      <div className="space-y-3">
        {/* All customers */}
        <label className="flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50 border-zinc-200">
          <input
            type="radio"
            name="audience-mode"
            value="ALL"
            checked={mode === 'ALL'}
            onChange={() => onModeChange('ALL')}
            className="mt-0.5 accent-amber-600"
          />
          <div>
            <p className="font-semibold text-sm text-zinc-800">All customers</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Send to every opted-in customer in your database.
            </p>
          </div>
        </label>

        {/* Filtered */}
        <label className="flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50 border-zinc-200">
          <input
            type="radio"
            name="audience-mode"
            value="FILTERED"
            checked={mode === 'FILTERED'}
            onChange={() => onModeChange('FILTERED')}
            className="mt-0.5 accent-amber-600"
          />
          <div className="flex-1">
            <p className="font-semibold text-sm text-zinc-800">Filtered customers</p>
            <p className="text-xs text-zinc-500 mt-0.5">
              Narrow the audience by purchase history.
            </p>
          </div>
        </label>
      </div>

      {mode === 'FILTERED' && (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-4">
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
            Filter criteria
          </p>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={filter.minPurchases === 1}
              onChange={(e) =>
                onFilterChange({
                  ...filter,
                  minPurchases: e.target.checked ? 1 : undefined,
                })
              }
              className="w-4 h-4 accent-amber-600 rounded"
            />
            <span className="text-sm text-zinc-700">Has made at least one purchase</span>
          </label>

          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-700 shrink-0">
              Minimum total spend
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm text-zinc-500">₹</span>
              <input
                type="number"
                min={0}
                placeholder="e.g. 5000"
                value={filter.minSpent ?? ''}
                onChange={(e) =>
                  onFilterChange({
                    ...filter,
                    minSpent: e.target.value ? Number(e.target.value) : undefined,
                  })
                }
                className="w-32 border border-zinc-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-100 p-3">
        <span className="text-blue-500 text-xs mt-0.5">ℹ</span>
        <p className="text-xs text-blue-700 leading-relaxed">
          Only customers who are opted-in to WhatsApp marketing and have not replied STOP will
          receive messages.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Schedule
// ---------------------------------------------------------------------------

const SCHEDULE_OPTIONS: {
  type: ScheduleType;
  label: string;
  description: string;
}[] = [
  {
    type: 'ONCE',
    label: 'Send once',
    description: 'Deliver at a specific date and time you choose.',
  },
  {
    type: 'DAILY',
    label: 'Daily',
    description: 'Automatically send every day at 9:00 AM.',
  },
  {
    type: 'WEEKLY',
    label: 'Weekly',
    description: 'Automatically send every Monday at 10:00 AM.',
  },
];

function ScheduleStep({
  scheduleType,
  scheduledAt,
  campaignName,
  onScheduleTypeChange,
  onScheduledAtChange,
  onCampaignNameChange,
}: {
  scheduleType: ScheduleType;
  scheduledAt: string;
  campaignName: string;
  onScheduleTypeChange: (t: ScheduleType) => void;
  onScheduledAtChange: (v: string) => void;
  onCampaignNameChange: (v: string) => void;
}) {
  // Minimum datetime: now + 5 minutes
  const minDatetime = new Date(Date.now() + 5 * 60 * 1000)
    .toISOString()
    .slice(0, 16);

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-semibold text-zinc-700 mb-1">
          Campaign name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => onCampaignNameChange(e.target.value)}
          placeholder="e.g. Diwali Sale Blast"
          className="w-full border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div>
        <p className="text-sm font-semibold text-zinc-700 mb-3">Schedule type</p>
        <div className="space-y-3">
          {SCHEDULE_OPTIONS.map((opt) => (
            <label
              key={opt.type}
              className="flex items-start gap-3 rounded-xl border-2 p-4 cursor-pointer transition-colors has-[:checked]:border-amber-500 has-[:checked]:bg-amber-50 border-zinc-200"
            >
              <input
                type="radio"
                name="schedule-type"
                value={opt.type}
                checked={scheduleType === opt.type}
                onChange={() => onScheduleTypeChange(opt.type)}
                className="mt-0.5 accent-amber-600"
              />
              <div>
                <p className="font-semibold text-sm text-zinc-800">{opt.label}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{opt.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {scheduleType === 'ONCE' && (
        <div>
          <label className="block text-sm font-semibold text-zinc-700 mb-1">
            Send at <span className="text-red-500">*</span>
          </label>
          <input
            type="datetime-local"
            min={minDatetime}
            value={scheduledAt}
            onChange={(e) => onScheduledAtChange(e.target.value)}
            className="border border-zinc-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function CampaignNewPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState(0);

  // Step 1
  const [templateId, setTemplateId] = useState('');

  // Step 2
  const [audienceMode, setAudienceMode] = useState<AudienceMode>('ALL');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({});

  // Step 3
  const [scheduleType, setScheduleType] = useState<ScheduleType>('ONCE');
  const [scheduledAt, setScheduledAt] = useState('');
  const [campaignName, setCampaignName] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: CampaignPayload) =>
      api.post('/campaigns', payload).then((r: any) => r.data),
    onSuccess: () => {
      toast.success('Campaign created');
      navigate('/owner/marketing');
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Failed to create campaign'),
  });

  // Validation per step
  const canAdvance = (): boolean => {
    if (step === 0) return !!templateId;
    if (step === 1) return true;
    if (step === 2) {
      if (!campaignName.trim()) return false;
      if (scheduleType === 'ONCE' && !scheduledAt) return false;
      return true;
    }
    return false;
  };

  const handleNext = () => {
    if (step < 2) {
      setStep((s) => s + 1);
    } else {
      const filter: AudienceFilter = audienceMode === 'ALL' ? {} : audienceFilter;
      const payload: CampaignPayload = {
        name: campaignName.trim(),
        templateId,
        scheduleType,
        audienceFilter: filter,
      };
      if (scheduleType === 'ONCE' && scheduledAt) {
        payload.scheduledAt = new Date(scheduledAt).toISOString();
      }
      mutation.mutate(payload);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-600 mb-1">
          Marketing
        </p>
        <h1 className="text-2xl font-bold text-zinc-900">New Campaign</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Send a WhatsApp campaign to your customers in three steps.
        </p>
      </div>

      <StepIndicator current={step} />

      {/* Card */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6">
        {step === 0 && (
          <TemplateStep selectedId={templateId} onSelect={setTemplateId} />
        )}
        {step === 1 && (
          <AudienceStep
            mode={audienceMode}
            filter={audienceFilter}
            onModeChange={setAudienceMode}
            onFilterChange={setAudienceFilter}
          />
        )}
        {step === 2 && (
          <ScheduleStep
            scheduleType={scheduleType}
            scheduledAt={scheduledAt}
            campaignName={campaignName}
            onScheduleTypeChange={setScheduleType}
            onScheduledAtChange={setScheduledAt}
            onCampaignNameChange={setCampaignName}
          />
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-5 border-t border-zinc-100">
          <button
            type="button"
            onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1.5 text-sm text-zinc-600 hover:text-zinc-900 transition-colors px-3 py-2 rounded-lg hover:bg-zinc-100"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? 'Cancel' : 'Back'}
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={!canAdvance() || mutation.isPending}
            className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : step < 2 ? (
              <>
                Next
                <ChevronRight className="w-4 h-4" />
              </>
            ) : (
              'Create Campaign'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
