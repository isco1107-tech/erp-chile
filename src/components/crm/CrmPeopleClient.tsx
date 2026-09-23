'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { BadgeCheck, Mail, MessageCircle, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useConfirm } from '@/components/ui/confirm-provider';
import { formatCurrency } from '@/lib/chile/tax';
import { toWhatsappDigits } from '@/lib/phone';
import { deletePersonAction, getPersonAction, listPeopleAction } from '@/modules/crm/actions/crm.actions';
import { DEAL_TYPE_LABELS, STAGE_LABELS } from '@/modules/crm/schema';
import type { CrmPersonDetail, CrmPersonRow } from '@/modules/crm/services/crm.service';
import { EMPTY_PERSON, PersonFormDialog, type PersonFormValues } from './PersonFormDialog';
import { STAGE_TONE } from './crm-ui';

function rowToForm(p: CrmPersonRow | CrmPersonDetail): PersonFormValues {
  return {
    id: p.id,
    fullName: p.fullName,
    jobTitle: p.jobTitle ?? '',
    contact: p.contact ? { id: p.contact.id, razonSocial: p.contact.razonSocial, rut: p.contact.rut } : null,
    organizationName: p.organizationName ?? '',
    email: p.email ?? '',
    phone: p.phone ?? '',
    instagram: p.instagram ?? '',
    linkedinUrl: p.linkedinUrl ?? '',
    isDecisionMaker: p.isDecisionMaker,
    tags: p.tags,
    notes: p.notes ?? '',
  };
}

/**
 * Directorio de personas de contacto comercial. La empresa (`Contact`, con
 * RUT) puede tener varias; una persona puede existir antes que la ficha
 * tributaria de su empresa.
 */
export function CrmPeopleClient({ canWrite }: { canWrite: boolean }) {
  const confirm = useConfirm();
  const [people, setPeople] = useState<CrmPersonRow[] | null>(null);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [formInitial, setFormInitial] = useState<PersonFormValues>(EMPTY_PERSON);
  const [detail, setDetail] = useState<CrmPersonDetail | null>(null);

  const load = useCallback(async () => {
    const result = await listPeopleAction();
    if (result.success) setPeople(result.data);
    else toast.error(result.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const tagSuggestions = useMemo(() => [...new Set((people ?? []).flatMap((p) => p.tags))].sort((a, b) => a.localeCompare(b, 'es-CL')), [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!people) return [];
    if (!q) return people;
    return people.filter((p) =>
      [p.fullName, p.jobTitle, p.email, p.phone, p.organizationName, p.contact?.razonSocial, ...p.tags].some((t) => t?.toLowerCase().includes(q))
    );
  }, [people, search]);

  function openForm(initial: PersonFormValues) {
    setFormInitial(initial);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  async function openDetail(id: string) {
    const result = await getPersonAction(id);
    if (result.success) setDetail(result.data);
    else toast.error(result.error);
  }

  async function remove(person: CrmPersonRow | CrmPersonDetail) {
    const ok = await confirm({
      title: `¿Eliminar a ${person.fullName}?`,
      description: 'Sus negocios se mantienen, solo quedan sin persona de contacto.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const result = await deletePersonAction(person.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success(result.message ?? 'Eliminado');
    setDetail(null);
    await load();
  }

  if (!people) return <p className="text-sm text-muted-foreground">Cargando contactos…</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, empresa, correo o etiqueta" className="pl-8" aria-label="Buscar contactos" />
        </div>
        <p className="text-sm text-muted-foreground">{filtered.length} contacto(s)</p>
        {canWrite && (
          <Button type="button" className="ml-auto" onClick={() => openForm(EMPTY_PERSON)}>
            <Plus aria-hidden="true" />
            Nuevo contacto
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            title={people.length === 0 ? 'Todavía no hay contactos comerciales' : 'Sin resultados'}
            description={people.length === 0 ? 'Agrega a las personas con las que conversas en cada marca. También se crean solos desde el formulario "Quiero auspiciar" del sitio del certamen.' : 'Prueba con otra búsqueda.'}
          />
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <li key={p.id} className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-card">
              <button type="button" onClick={() => void openDetail(p.id)} className="text-left">
                <p className="flex items-center gap-1.5 font-medium text-foreground">
                  {p.fullName}
                  {p.isDecisionMaker && <BadgeCheck className="size-4 text-primary" aria-label="Toma la decisión" />}
                </p>
                <p className="text-xs text-muted-foreground">{[p.jobTitle, p.contact?.razonSocial ?? p.organizationName].filter(Boolean).join(' · ') || 'Sin cargo ni empresa'}</p>
              </button>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.email && (
                  <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted" aria-label={`Escribir a ${p.email}`}>
                    <Mail className="size-3" aria-hidden="true" />
                    Correo
                  </a>
                )}
                {p.phone && (
                  <>
                    <a href={`tel:${p.phone}`} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">
                      <Phone className="size-3" aria-hidden="true" />
                      Llamar
                    </a>
                    <a href={`https://wa.me/${toWhatsappDigits(p.phone)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-xs hover:bg-muted">
                      <MessageCircle className="size-3" aria-hidden="true" />
                      WhatsApp
                    </a>
                  </>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-3">
                <span className="text-xs text-muted-foreground">{p._count.opportunities} negocio(s)</span>
                {p.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {tag}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <PersonFormDialog key={formKey} open={formOpen} onOpenChange={setFormOpen} initial={formInitial} tagSuggestions={tagSuggestions} onSaved={() => void load()} />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-w-xl">
          {detail && (
            <>
              <DialogHeader>
                <DialogTitle>{detail.fullName}</DialogTitle>
                <DialogDescription>{[detail.jobTitle, detail.contact?.razonSocial ?? detail.organizationName].filter(Boolean).join(' · ') || 'Contacto comercial'}</DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                {detail.email && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Correo</dt>
                    <dd>
                      <a href={`mailto:${detail.email}`} className="text-primary hover:underline">
                        {detail.email}
                      </a>
                    </dd>
                  </div>
                )}
                {detail.phone && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Teléfono</dt>
                    <dd>{detail.phone}</dd>
                  </div>
                )}
                {detail.instagram && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Instagram</dt>
                    <dd>@{detail.instagram}</dd>
                  </div>
                )}
                {detail.contact && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Empresa</dt>
                    <dd>
                      {detail.contact.razonSocial} · {detail.contact.rut}
                    </dd>
                  </div>
                )}
              </dl>
              {detail.notes && <p className="mt-2 text-sm whitespace-pre-line text-foreground">{detail.notes}</p>}
              <h3 className="mt-4 text-sm font-semibold">Negocios</h3>
              {detail.opportunities.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin negocios asociados.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {detail.opportunities.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                      <Link href={`/dashboard/crm?open=${o.id}`} className="min-w-0 truncate hover:underline">
                        {o.title}
                        <span className="ml-1 text-xs text-muted-foreground">· {DEAL_TYPE_LABELS[o.dealType]}</span>
                      </Link>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-xs tabular-nums">{formatCurrency(o.amount)}</span>
                        <StatusBadge tone={STAGE_TONE[o.stage]}>{STAGE_LABELS[o.stage]}</StatusBadge>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canWrite && (
                <div className="mt-4 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const initial = rowToForm(detail);
                      setDetail(null);
                      openForm(initial);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="ml-auto text-danger" onClick={() => void remove(detail)}>
                    <Trash2 aria-hidden="true" />
                    Eliminar
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
