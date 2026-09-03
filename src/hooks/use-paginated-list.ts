'use client';

import { useEffect, useMemo, useState } from 'react';

const DEFAULT_PAGE_SIZE = 25;

/**
 * Pagina en el cliente un arreglo ya cargado en memoria.
 *
 * Las tablas del ERP traen el listado filtrado completo desde el servidor (no
 * hay paginación de API todavía) y lo guardan en estado local, así que cortarlo
 * en páginas se resuelve acá, del lado del cliente, sin tocar las Server Actions.
 */
export function usePaginatedList<T>(items: T[], initialPageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Si una nueva búsqueda deja menos páginas que la actual, vuelve a una
  // página válida en vez de mostrar un cuerpo de tabla vacío.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  const pageItems = useMemo(() => items.slice((page - 1) * pageSize, page * pageSize), [items, page, pageSize]);

  function setPageSize(size: number) {
    setPageSizeState(size);
    setPage(1);
  }

  return { page, setPage, pageSize, setPageSize, pageCount, pageItems, totalItems: items.length };
}
