'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RutInput } from '@/components/ui/RutInput';
import {
  ARAUCANIA_COMUNAS,
  candidateCreateSchema,
  candidateUpdateSchema,
  CANDIDATE_STATUS_LABELS,
  CANDIDATE_STATUSES,
} from '@/modules/candidates/schema';
import {
  createCandidateAction,
  listCandidateProjectOptionsAction,
  updateCandidateAction,
} from '@/modules/candidates/actions/candidates.actions';
import type { CandidateProjectOption, CandidateWithProject } from '@/modules/candidates/services/candidates.service';

const selectClass =
  'h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30';

// `REJECTED` queda fuera de este selector genérico: exige un motivo
// obligatorio (Sección 6) que solo pide el cambio de estado dedicado en la
// ficha (`StatusChangeSection`) — acá siempre fallaría contra el guard del
// service (`updateCandidate` rechaza `status: 'REJECTED'` a propósito).
const FORM_ASSIGNABLE_STATUSES = CANDIDATE_STATUSES.filter((s) => s !== 'REJECTED');

const EMPTY_FORM = {
  projectId: '',
  rut: '',
  fullName: '',
  stageName: '',
  email: '',
  phone: '',
  birthDate: '',
  dressSize: '',
  shoeSize: '',
  heightCm: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  guardianName: '',
  guardianRut: '',
  status: 'APPLICANT' as (typeof CANDIDATE_STATUSES)[number],
  notes: '',
  comuna: '',
  direccion: '',
  ocupacion: '',
  instagram: '',
  idiomas: '',
  experiencia: '',
  motivacion: '',
  causaSocial: '',
  condicionesMedicas: '',
};

type FormState = typeof EMPTY_FORM;

interface CandidateFormProps {
  editingCandidate?: CandidateWithProject;
}

async function uploadCandidatePhoto(candidateId: string, file: File): Promise<string> {
  const form = new FormData();
  form.append('candidateId', candidateId);
  form.append('file', file);
  const res = await fetch('/api/candidates/photo-upload', { method: 'POST', body: form });
  const json = (await res.json()) as { success: boolean; data?: { url: string }; error?: string };
  if (!json.success || !json.data) throw new Error(json.error ?? 'No se pudo subir la foto');
  return json.data.url;
}

export default function CandidateForm({ editingCandidate }: CandidateFormProps) {
  const router = useRouter();
  const [projects, setProjects] = useState<CandidateProjectOption[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(editingCandidate?.photoUrl ?? '');
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState(editingCandidate?.photoUrl ?? '');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
    };
  }, [photoPreviewUrl]);

  useEffect(() => {
    listCandidateProjectOptionsAction().then((r) => {
      if (r.success) setProjects(r.data);
      else toast.error(r.error);
    });
  }, []);

  useEffect(() => {
    if (editingCandidate) {
      setForm({
        projectId: editingCandidate.projectId,
        rut: editingCandidate.rut,
        fullName: editingCandidate.fullName,
        stageName: editingCandidate.stageName ?? '',
        email: editingCandidate.email ?? '',
        phone: editingCandidate.phone ?? '',
        birthDate: new Date(editingCandidate.birthDate).toISOString().slice(0, 10),
        dressSize: editingCandidate.dressSize ?? '',
        shoeSize: editingCandidate.shoeSize ?? '',
        heightCm: editingCandidate.heightCm != null ? String(editingCandidate.heightCm) : '',
        emergencyContactName: editingCandidate.emergencyContactName ?? '',
        emergencyContactPhone: editingCandidate.emergencyContactPhone ?? '',
        guardianName: editingCandidate.guardianName ?? '',
        guardianRut: editingCandidate.guardianRut ?? '',
        status: editingCandidate.status,
        notes: editingCandidate.notes ?? '',
        comuna: editingCandidate.comuna ?? '',
        direccion: editingCandidate.direccion ?? '',
        ocupacion: editingCandidate.ocupacion ?? '',
        instagram: editingCandidate.instagram ?? '',
        idiomas: editingCandidate.idiomas ?? '',
        experiencia: editingCandidate.experiencia ?? '',
        motivacion: editingCandidate.motivacion ?? '',
        causaSocial: editingCandidate.causaSocial ?? '',
        condicionesMedicas: editingCandidate.condicionesMedicas ?? '',
      });
      setPhotoUrl(editingCandidate.photoUrl ?? '');
      setPhotoPreviewUrl(editingCandidate.photoUrl ?? '');
      setPendingPhotoFile(null);
      setErrors({});
    }
  }, [editingCandidate]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen supera los 5 MB');
      return;
    }

    if (editingCandidate) {
      setUploadingPhoto(true);
      try {
        const url = await uploadCandidatePhoto(editingCandidate.id, file);
        setPhotoUrl(url);
        setPhotoPreviewUrl(url);
        toast.success('Foto actualizada');
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'No se pudo subir la foto');
      } finally {
        setUploadingPhoto(false);
        if (photoInputRef.current) photoInputRef.current.value = '';
      }
    } else {
      if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrl);
      }
      setPendingPhotoFile(file);
      const objectUrl = URL.createObjectURL(file);
      setPhotoPreviewUrl(objectUrl);
      if (photoInputRef.current) photoInputRef.current.value = '';
    }
  }

  function handleRemovePhoto() {
    if (photoPreviewUrl && photoPreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrl);
    }
    setPendingPhotoFile(null);
    setPhotoPreviewUrl(photoUrl);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors({});

    const payload = {
      ...form,
      email: form.email || undefined,
      heightCm: form.heightCm ? Number(form.heightCm) : undefined,
    };

    const schema = editingCandidate ? candidateUpdateSchema : candidateCreateSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? 'form');
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    try {
      const result = editingCandidate
        ? await updateCandidateAction(editingCandidate.id, parsed.data)
        : await createCandidateAction(parsed.data);

      if (!result.success) {
        toast.error(result.error);
        setErrors({ form: result.error });
        return;
      }

      if (!editingCandidate && pendingPhotoFile) {
        try {
          await uploadCandidatePhoto(result.data.id, pendingPhotoFile);
        } catch (photoError) {
          toast.error(
            photoError instanceof Error
              ? `Candidata creada, pero no se pudo subir la foto: ${photoError.message}`
              : 'Candidata creada, pero no se pudo subir la foto'
          );
        }
      }

      toast.success(result.message ?? 'Candidata guardada');
      router.push(`/dashboard/candidates/${result.data.id}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-4 rounded-xl border border-border p-4">
      <div>
        <Label>Foto</Label>
        <div className="mt-1 flex items-center gap-3">
          <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/40">
            {photoPreviewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreviewUrl} alt={form.fullName || 'Vista previa'} className="size-full object-cover" />
            ) : (
              <span className="text-xs text-muted-foreground">Sin foto</span>
            )}
          </div>
          <div className="space-y-1">
            <input
              ref={photoInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" variant="outline" disabled={uploadingPhoto || saving} onClick={() => photoInputRef.current?.click()}>
                {uploadingPhoto ? 'Subiendo...' : photoPreviewUrl ? 'Cambiar foto' : 'Subir foto'}
              </Button>
              {!editingCandidate && pendingPhotoFile && (
                <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={handleRemovePhoto}>
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">PNG, JPG o WEBP, hasta 5 MB.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="projectId">Proyecto/Certamen</Label>
          <select
            id="projectId"
            className={selectClass}
            value={form.projectId}
            onChange={(e) => update('projectId', e.target.value)}
            disabled={!!editingCandidate}
            aria-invalid={!!errors.projectId}
          >
            <option value="">Seleccione un proyecto</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
            ))}
          </select>
          {editingCandidate && (
            <p className="mt-1 text-xs text-muted-foreground">El proyecto no se puede cambiar una vez creada la candidata.</p>
          )}
          {errors.projectId && <p className="mt-1 text-sm text-destructive">{errors.projectId}</p>}
        </div>

        <div>
          <Label htmlFor="rut">RUT</Label>
          <RutInput id="rut" value={form.rut} onChange={(value) => update('rut', value)} invalid={!!errors.rut} />
          {errors.rut && <p className="mt-1 text-sm text-destructive">{errors.rut}</p>}
        </div>

        <div>
          <Label htmlFor="fullName">Nombre completo</Label>
          <Input id="fullName" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} aria-invalid={!!errors.fullName} />
          {errors.fullName && <p className="mt-1 text-sm text-destructive">{errors.fullName}</p>}
        </div>

        <div>
          <Label htmlFor="stageName">Nombre artístico / de certamen</Label>
          <Input id="stageName" value={form.stageName} onChange={(e) => update('stageName', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={!!errors.email} />
          {errors.email && <p className="mt-1 text-sm text-destructive">{errors.email}</p>}
        </div>

        <div>
          <Label htmlFor="phone">Teléfono</Label>
          <Input id="phone" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
        </div>

        <div>
          <Label htmlFor="birthDate">Fecha de nacimiento</Label>
          <Input id="birthDate" type="date" value={form.birthDate} onChange={(e) => update('birthDate', e.target.value)} aria-invalid={!!errors.birthDate} />
          {errors.birthDate && <p className="mt-1 text-sm text-destructive">{errors.birthDate}</p>}
        </div>

        <div>
          <Label htmlFor="status">Estado</Label>
          <select id="status" className={selectClass} value={form.status} onChange={(e) => update('status', e.target.value as FormState['status'])}>
            {FORM_ASSIGNABLE_STATUSES.map((s) => (
              <option key={s} value={s}>{CANDIDATE_STATUS_LABELS[s]}</option>
            ))}
          </select>
          {editingCandidate && (
            <p className="mt-1 text-xs text-muted-foreground">Para descartar (con motivo), usa el cambio de estado en la ficha.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase">Perfil de postulación</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="comuna">Comuna</Label>
            <select id="comuna" className={selectClass} value={form.comuna} onChange={(e) => update('comuna', e.target.value)}>
              <option value="">Sin especificar</option>
              {ARAUCANIA_COMUNAS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="direccion">Dirección</Label>
            <Input id="direccion" value={form.direccion} onChange={(e) => update('direccion', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ocupacion">Ocupación o estudios</Label>
            <Input id="ocupacion" value={form.ocupacion} onChange={(e) => update('ocupacion', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="instagram">Instagram</Label>
            <Input id="instagram" value={form.instagram} onChange={(e) => update('instagram', e.target.value)} placeholder="@usuario" />
          </div>
          <div>
            <Label htmlFor="idiomas">Idiomas</Label>
            <Input id="idiomas" value={form.idiomas} onChange={(e) => update('idiomas', e.target.value)} />
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="experiencia">Experiencia previa</Label>
            <textarea
              id="experiencia"
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.experiencia}
              onChange={(e) => update('experiencia', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="motivacion">Motivación</Label>
            <textarea
              id="motivacion"
              rows={3}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.motivacion}
              onChange={(e) => update('motivacion', e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="causaSocial">Causa social</Label>
            <textarea
              id="causaSocial"
              rows={2}
              className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
              value={form.causaSocial}
              onChange={(e) => update('causaSocial', e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase">Medidas y tallas</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="dressSize">Talla de vestido</Label>
            <Input id="dressSize" value={form.dressSize} onChange={(e) => update('dressSize', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="shoeSize">Talla de zapato</Label>
            <Input id="shoeSize" value={form.shoeSize} onChange={(e) => update('shoeSize', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="heightCm">Estatura (cm)</Label>
            <Input
              id="heightCm"
              type="number"
              min={0}
              value={form.heightCm}
              onChange={(e) => update('heightCm', e.target.value)}
              aria-invalid={!!errors.heightCm}
            />
            {errors.heightCm && <p className="mt-1 text-sm text-destructive">{errors.heightCm}</p>}
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-3 text-xs font-semibold text-muted-foreground uppercase">Contacto de emergencia y salud</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="emergencyContactName">Nombre</Label>
            <Input id="emergencyContactName" value={form.emergencyContactName} onChange={(e) => update('emergencyContactName', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="emergencyContactPhone">Teléfono</Label>
            <Input id="emergencyContactPhone" value={form.emergencyContactPhone} onChange={(e) => update('emergencyContactPhone', e.target.value)} />
          </div>
        </div>
        <div className="mt-4">
          <Label htmlFor="condicionesMedicas">Alergias o condiciones médicas</Label>
          <textarea
            id="condicionesMedicas"
            rows={2}
            className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
            value={form.condicionesMedicas}
            onChange={(e) => update('condicionesMedicas', e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            El certificado médico (si la candidata subió uno al postular) queda como documento en la ficha, no acá.
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-dashed border-border p-3">
        <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">Representante legal (solo si es menor de edad)</p>
        <p className="mb-3 text-xs text-muted-foreground">
          Completa esto solo si la candidata es menor de edad — el contrato de imagen agrega automáticamente un tercer bloque de firma para el tutor
          únicamente cuando este nombre está cargado.
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="guardianName">Nombre</Label>
            <Input id="guardianName" value={form.guardianName} onChange={(e) => update('guardianName', e.target.value)} />
          </div>
          <div>
            <Label htmlFor="guardianRut">RUT</Label>
            <Input id="guardianRut" value={form.guardianRut} onChange={(e) => update('guardianRut', e.target.value)} />
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="notes">Notas</Label>
        <Input id="notes" value={form.notes} onChange={(e) => update('notes', e.target.value)} />
      </div>

      {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Guardando...' : editingCandidate ? 'Guardar cambios' : 'Crear candidata'}
        </Button>
      </div>
    </form>
  );
}
