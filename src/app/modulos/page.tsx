import { redirect } from 'next/navigation';

/** La lista de módulos vive en la landing; `/modulos` a secas lleva ahí. */
export default function ModulosPage() {
  redirect('/#modulos');
}
