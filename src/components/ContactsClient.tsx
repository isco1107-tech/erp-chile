'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pagination } from '@/components/ui/pagination';
import ContactForm from './ContactForm';
import { listContactsPageAction, deleteContactAction, getContactAction } from '@/modules/contacts/actions/contacts.actions';
import type { ContactListItem } from '@/modules/contacts/services/contacts.service';

type Filter = 'all' | 'customers' | 'suppliers';

const DEFAULT_PAGE_SIZE = 25;

export default function ContactsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const [showForm, setShowForm] = useState(false);
  const [editingContact, setEditingContact] = useState<ContactListItem | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Volver a la página 1 cuando cambia el filtro efectivo: quedarse en una
  // página que ya no tiene el mismo contenido es más confuso que reiniciar.
  useEffect(() => {
    setPage(1);
  }, [debouncedQuery, filter]);

  async function load() {
    setLoading(true);
    const result = await listContactsPageAction(
      debouncedQuery || undefined,
      filter === 'all' ? undefined : filter,
      page,
      pageSize
    );
    if (result.success) {
      setContacts(result.data.items);
      setTotal(result.data.total);
    } else {
      toast.error(result.error);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery, filter, page, pageSize]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  // Deep-link desde la paleta de comandos: "+ Nuevo Cliente" abre el
  // formulario en blanco, y elegir un resultado de la búsqueda abre su ficha
  // de edición directamente, sin que el usuario tenga que volver a buscarlo acá.
  useEffect(() => {
    const editId = searchParams.get('edit');
    const isNew = searchParams.get('new');

    if (editId) {
      getContactAction(editId).then((result) => {
        if (result.success) {
          setEditingContact(result.data);
          setShowForm(true);
        } else {
          toast.error(result.error);
        }
      });
    } else if (isNew) {
      setEditingContact(null);
      setShowForm(true);
    }

    if (editId || isNew) router.replace('/dashboard/contacts');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function handleSaved() {
    setShowForm(false);
    setEditingContact(null);
    load();
  }

  function handleEdit(contact: ContactListItem) {
    setEditingContact(contact);
    setShowForm(true);
  }

  async function handleDelete(contact: ContactListItem) {
    if (!confirm(`¿Eliminar el contacto "${contact.razonSocial}"?`)) return;
    const result = await deleteContactAction(contact.id);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    toast.success('Contacto eliminado');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="Buscar por RUT o Razón Social"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
          <div className="flex gap-1">
            <Button type="button" size="sm" variant={filter === 'all' ? 'default' : 'outline'} onClick={() => setFilter('all')}>
              Todos
            </Button>
            <Button type="button" size="sm" variant={filter === 'customers' ? 'default' : 'outline'} onClick={() => setFilter('customers')}>
              Clientes
            </Button>
            <Button type="button" size="sm" variant={filter === 'suppliers' ? 'default' : 'outline'} onClick={() => setFilter('suppliers')}>
              Proveedores
            </Button>
          </div>
        </div>

        <Button
          type="button"
          onClick={() => {
            setEditingContact(null);
            setShowForm((s) => !s);
          }}
        >
          {showForm && !editingContact ? 'Cerrar formulario' : 'Nuevo contacto'}
        </Button>
      </div>

      {showForm && (
        <ContactForm
          editingContact={editingContact}
          onSaved={handleSaved}
          onCancelEdit={() => {
            setEditingContact(null);
            setShowForm(false);
          }}
        />
      )}

      <div className="rounded-xl border border-border">
        <div className="max-h-[65vh] scroll-smooth overflow-auto">
          <table className="w-full min-w-[720px] table-auto text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-left backdrop-blur-sm">
              <tr>
                <th className="p-2 font-medium">RUT</th>
                <th className="p-2 font-medium">Razón Social</th>
                <th className="p-2 font-medium">Tipo</th>
                <th className="p-2 font-medium">Comuna</th>
                <th className="p-2 font-medium">Teléfono</th>
                <th className="p-2 font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="p-4 text-center text-muted-foreground" colSpan={6}>Cargando...</td>
                </tr>
              )}
              {!loading && contacts.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title={query ? 'Sin resultados para tu búsqueda' : 'Todavía no tienes contactos'}
                      description={
                        query
                          ? 'Prueba con otro RUT o razón social.'
                          : 'Registra tu primer cliente o proveedor para empezar a facturar.'
                      }
                      actionLabel={query ? undefined : 'Nuevo contacto'}
                      onAction={query ? undefined : () => setShowForm(true)}
                    />
                  </td>
                </tr>
              )}
              {!loading && contacts.map((c) => (
              <tr key={c.id} className="border-t border-border">
                <td className="p-2">{c.rut}</td>
                <td className="p-2">{c.razonSocial}</td>
                <td className="p-2">
                  {c.isCustomer && <span className="mr-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs">Cliente</span>}
                  {c.isSupplier && <span className="rounded-full bg-secondary px-2 py-0.5 text-xs">Proveedor</span>}
                </td>
                <td className="p-2">{c.comuna}</td>
                <td className="p-2">{c.phone}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(c)}>Editar</Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => handleDelete(c)}>Eliminar</Button>
                  </div>
                </td>
              </tr>
            ))}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalItems={total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
