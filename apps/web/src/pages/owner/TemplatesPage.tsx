import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Plus,
  Trash2,
  X,
  MessageSquare,
  AlertTriangle,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { api } from '../../lib/api';

// ── Types ────────────────────────────────────────────────────────────────────

type TemplateCategory = 'MARKETING' | 'UTILITY';

interface Template {
  id: string;
  name: string;
  displayName: string;
  category: TemplateCategory;
  bodyText: string;
  variables: string[];
  active: boolean;
  createdAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const AVAILABLE_VARIABLES: { key: string; label: string; sample: string }[] = [
  { key: 'customerName',  label: 'Customer Name',   sample: 'Ramesh Mehta'  },
  { key: 'gold22kRate',   label: 'Gold 22K Rate',   sample: '₹6,420/g'      },
  { key: 'gold24kRate',   label: 'Gold 24K Rate',   sample: '₹6,850/g'      },
  { key: 'silverRate',    label: 'Silver Rate',      sample: '₹84/g'         },
  { key: 'shopName',      label: 'Shop Name',        sample: 'Swarna Jewels' },
];

// ── Zod schema ────────────────────────────────────────────────────────────────

const templateSchema = z.object({
  name: z
    .string()
    .min(3, 'At least 3 characters')
    .max(64, 'Too long')
    .regex(/^[a-z0-9_]+$/, 'Only lowercase letters, digits, and underscores'),
  displayName: z.string().min(2, 'Required').max(80, 'Too long'),
  category: z.enum(['MARKETING', 'UTILITY']),
  bodyText: z.string().min(10, 'Message too short').max(1024, 'Message too long'),
  variables: z.array(z.string()),
});

type TemplateFormData = z.infer<typeof templateSchema>;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Replace {{variableName}} placeholders in bodyText with sample values for the
 * live preview. Unknown placeholders are shown as-is.
 */
function renderPreview(bodyText: string, variables: string[]): string {
  let text = bodyText;
  variables.forEach((varKey) => {
    const def = AVAILABLE_VARIABLES.find((v) => v.key === varKey);
    const sample = def?.sample ?? varKey;
    text = text.replaceAll(`{{${varKey}}}`, sample);
  });
  return text;
}

/**
 * Render bodyText with {{variable}} spans highlighted in amber, for display
 * inside a template card.
 */
function HighlightedBody({ text }: { text: string }) {
  const parts = text.split(/({{[^}]+}})/g);
  return (
    <span>
      {parts.map((part, i) => {
        const isVar = /^{{.+}}$/.test(part);
        return isVar ? (
          <mark
            key={i}
            className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded px-0.5 not-italic font-medium"
          >
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </span>
  );
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteConfirm({
  template,
  onConfirm,
  onCancel,
  isPending,
}: {
  template: Template;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-card border rounded-2xl p-6 shadow-xl w-full max-w-sm mx-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex-shrink-0 rounded-full bg-red-100 dark:bg-red-900/30 p-2">
            <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          </span>
          <div>
            <p className="font-semibold text-foreground">Delete template?</p>
            <p className="text-sm text-muted-foreground mt-1">
              <span className="font-medium text-foreground/80">{template.displayName}</span> will be
              permanently removed and cannot be used in future campaigns.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────────────────

function TemplateCard({
  template,
  onDelete,
}: {
  template: Template;
  onDelete: (t: Template) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const isMarketing = template.category === 'MARKETING';
  const truncated = template.bodyText.length > 160 && !expanded;
  const displayText = truncated ? template.bodyText.slice(0, 160) + '…' : template.bodyText;

  return (
    <div className="bg-card border rounded-xl p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow">
      {/* Card header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-foreground truncate leading-tight">{template.displayName}</p>
          <p className="text-xs text-muted-foreground/70 font-mono mt-0.5">{template.name}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Active indicator */}
          <span
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full font-medium ${
              template.active
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-400'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                template.active ? 'bg-emerald-500' : 'bg-muted-foreground/40'
              }`}
            />
            {template.active ? 'Active' : 'Inactive'}
          </span>
          {/* Category badge */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-semibold tracking-wide ${
              isMarketing
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
            }`}
          >
            {template.category}
          </span>
        </div>
      </div>

      {/* Body text */}
      <div className="bg-muted/50 rounded-lg px-3 py-2.5 text-sm font-mono text-foreground/80 leading-relaxed">
        <HighlightedBody text={displayText} />
        {template.bodyText.length > 160 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="ml-1 text-amber-600 dark:text-amber-400 text-xs hover:underline inline-flex items-center gap-0.5"
          >
            {expanded ? 'Show less' : 'Show more'}
            <ChevronRight
              className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Variables */}
      {template.variables.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {template.variables.map((varKey) => {
            const def = AVAILABLE_VARIABLES.find((v) => v.key === varKey);
            return (
              <span
                key={varKey}
                className="inline-flex items-center text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium"
              >
                {def?.label ?? varKey}
              </span>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border/50">
        <p className="text-xs text-muted-foreground/60 tabular-nums">
          {new Date(template.createdAt).toLocaleDateString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
          })}
        </p>
        <button
          onClick={() => onDelete(template)}
          className="flex items-center gap-1 text-xs text-red-500/70 hover:text-red-600 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Create panel ──────────────────────────────────────────────────────────────

function CreatePanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TemplateFormData>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: '',
      displayName: '',
      category: 'MARKETING',
      bodyText: '',
      variables: [],
    },
  });

  const watchedVariables = watch('variables');
  const watchedBody = watch('bodyText');
  const [showPreview, setShowPreview] = useState(false);

  const createMutation = useMutation({
    mutationFn: (data: TemplateFormData) => api.post('/campaigns/templates', data),
    onSuccess: () => {
      toast.success('Template created');
      onCreated();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed to create template'),
  });

  function toggleVariable(varKey: string) {
    const current = watchedVariables ?? [];
    if (current.includes(varKey)) {
      setValue('variables', current.filter((v) => v !== varKey), { shouldValidate: true });
    } else {
      setValue('variables', [...current, varKey], { shouldValidate: true });
    }
  }

  function insertVariable(varKey: string) {
    const textarea = document.getElementById('bodyText-input') as HTMLTextAreaElement | null;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const current = watchedBody ?? '';
    const inserted = current.slice(0, start) + `{{${varKey}}}` + current.slice(end);
    setValue('bodyText', inserted, { shouldValidate: true });
    // Ensure variable is also selected
    if (!watchedVariables.includes(varKey)) {
      setValue('variables', [...watchedVariables, varKey], { shouldValidate: true });
    }
    // Restore focus after React re-render
    setTimeout(() => {
      textarea.focus();
      const newPos = start + `{{${varKey}}}`.length;
      textarea.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const previewText = renderPreview(watchedBody ?? '', watchedVariables ?? []);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Slide-in panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl flex flex-col bg-card border-l shadow-2xl">
        {/* Panel header */}
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <div>
            <p className="font-semibold text-foreground">New Template</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create a reusable WhatsApp message
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Panel body */}
        <form
          id="create-template-form"
          onSubmit={handleSubmit((d) => createMutation.mutate(d))}
          className="flex-1 overflow-y-auto px-6 py-5 space-y-5"
        >
          {/* Template name (identifier) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Template Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register('name')}
              placeholder="daily_rate_alert"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-colors"
            />
            <p className="text-xs text-muted-foreground/60">
              Lowercase letters, digits, and underscores only. This is the internal identifier.
            </p>
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Display name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              {...register('displayName')}
              placeholder="Daily Rate Alert"
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-colors"
            />
            {errors.displayName && (
              <p className="text-xs text-red-500">{errors.displayName.message}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Category
            </label>
            <div className="flex gap-2">
              {(['MARKETING', 'UTILITY'] as const).map((cat) => {
                const active = watch('category') === cat;
                return (
                  <label
                    key={cat}
                    className={`flex-1 flex items-center justify-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                      active
                        ? cat === 'MARKETING'
                          ? 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300'
                          : 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                        : 'hover:bg-muted/50 text-muted-foreground'
                    }`}
                  >
                    <input
                      type="radio"
                      value={cat}
                      className="sr-only"
                      {...register('category')}
                    />
                    <span className="font-medium">{cat}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Variables selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Variables
            </label>
            <p className="text-xs text-muted-foreground/70">
              Click a variable to toggle it. Use "Insert" to place it at the cursor in the message.
            </p>
            <div className="flex flex-wrap gap-2">
              {AVAILABLE_VARIABLES.map((v) => {
                const selected = (watchedVariables ?? []).includes(v.key);
                return (
                  <div key={v.key} className="flex items-center rounded-lg overflow-hidden border text-xs">
                    <button
                      type="button"
                      onClick={() => toggleVariable(v.key)}
                      className={`px-2.5 py-1.5 font-medium transition-colors ${
                        selected
                          ? 'bg-amber-500 text-white'
                          : 'bg-card text-foreground/70 hover:bg-muted/60'
                      }`}
                    >
                      {v.label}
                    </button>
                    <button
                      type="button"
                      onClick={() => insertVariable(v.key)}
                      title={`Insert {{${v.key}}} at cursor`}
                      className="border-l px-2 py-1.5 text-muted-foreground hover:bg-muted/50 hover:text-amber-600 transition-colors"
                    >
                      + Insert
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body text */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Message Body <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPreview((p) => !p)}
                className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:underline"
              >
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? 'Hide preview' : 'Preview'}
              </button>
            </div>
            <textarea
              id="bodyText-input"
              {...register('bodyText')}
              rows={6}
              placeholder={`Hello {{customerName}},\n\nToday's gold rate is {{gold22kRate}} for 22K.\n\nVisit us at {{shopName}}.`}
              className="w-full border rounded-lg px-3 py-2.5 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 transition-colors"
            />
            <p className="text-xs text-muted-foreground/60 tabular-nums text-right">
              {(watchedBody ?? '').length} / 1024
            </p>
            {errors.bodyText && (
              <p className="text-xs text-red-500">{errors.bodyText.message}</p>
            )}
          </div>

          {/* Live preview */}
          {showPreview && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Live Preview
              </p>
              <div className="bg-[#e9f5d7] dark:bg-[#1a2e14] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-[#1a1a1a] dark:text-[#d4edba] max-w-sm shadow-sm">
                {previewText || (
                  <span className="text-muted-foreground/50 italic">
                    Start typing your message…
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground/50">
                Shown with sample values. Actual message will use real data.
              </p>
            </div>
          )}
        </form>

        {/* Panel footer */}
        <div className="px-6 py-4 border-t flex items-center justify-end gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border hover:bg-muted/50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-template-form"
            disabled={createMutation.isPending}
            className="px-5 py-2 text-sm rounded-lg bg-amber-600 text-white font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors"
          >
            {createMutation.isPending ? 'Creating…' : 'Create Template'}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TemplatesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const { data, isLoading } = useQuery<Template[]>({
    queryKey: ['campaign-templates'],
    queryFn: () => api.get('/campaigns/templates').then((r: any) => r.data?.data ?? r.data ?? []),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/campaigns/templates/${id}`),
    onSuccess: () => {
      toast.success('Template deleted');
      qc.invalidateQueries({ queryKey: ['campaign-templates'] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete template'),
  });

  const templates: Template[] = data ?? [];

  return (
    <div className="p-6 space-y-6">
      {/* ── Page header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-foreground">Message Templates</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Reusable WhatsApp messages for customer campaigns
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add Template
        </button>
      </div>

      {/* ── Template grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-card border rounded-xl p-5 space-y-3">
              <div className="skeleton h-4 w-2/3" />
              <div className="skeleton h-3 w-1/3" />
              <div className="skeleton h-20 w-full" />
              <div className="flex gap-2">
                <div className="skeleton h-5 w-16" />
                <div className="skeleton h-5 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageSquare className="w-6 h-6 text-muted-foreground/60" />
          </span>
          <p className="font-medium text-foreground/80">No templates yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-xs">
            Create your first message template to start sending WhatsApp campaigns to customers.
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-5 flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Template
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} onDelete={setDeleteTarget} />
          ))}
        </div>
      )}

      {/* ── Create panel ── */}
      {showCreate && (
        <CreatePanel
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ['campaign-templates'] });
          }}
        />
      )}

      {/* ── Delete confirmation ── */}
      {deleteTarget && (
        <DeleteConfirm
          template={deleteTarget}
          onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
          isPending={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
