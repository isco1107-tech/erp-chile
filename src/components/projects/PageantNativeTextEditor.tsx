'use client';

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PAGEANT_NATIVE_TEXT, type PageantNativeTextField } from '@/lib/events/pageant-native-text';

export function PageantNativeTextEditor({ field, value, onChange, children }: {
  field: PageantNativeTextField;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  const { label, max, multiline } = PAGEANT_NATIVE_TEXT[field];
  const [initial, setInitial] = useState<{ stored: string; displayed: string }>();
  const wrapper = useRef<HTMLElement | null>(null);
  const restoreFocus = useRef(false);
  const Tag = field === 'publicDescription' ? 'div' : 'span';

  useLayoutEffect(() => {
    if (initial !== undefined) {
      const control = wrapper.current?.querySelector('input,textarea');
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        control.focus({ preventScroll: true });
        control.select();
      }
    } else if (restoreFocus.current) {
      wrapper.current?.focus({ preventScroll: true });
      restoreFocus.current = false;
    }
  }, [initial]);

  function startEditing() {
    // La frase generada se puede usar como punto de partida y sigue automática si se sale sin editar.
    const fallback = typeof children === 'string' && children.length <= max ? children : '';
    setInitial({ stored: value, displayed: value || fallback });
  }

  function finish(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      onChange(initial?.stored ?? '');
    } else if (event.key !== 'Enter' || (multiline && !(event.metaKey || event.ctrlKey))) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    restoreFocus.current = true;
    setInitial(undefined);
  }

  if (initial !== undefined) {
    const props = {
      'aria-label': label,
      defaultValue: initial.displayed,
      maxLength: max,
      placeholder: label,
      onKeyDown: finish,
      onBlur: () => setInitial(undefined),
      className: 'block w-full min-w-0 rounded-sm bg-transparent px-1 text-inherit outline-2 outline-offset-2 outline-sky-500',
      style: { font: 'inherit', textAlign: 'inherit', letterSpacing: 'inherit', color: 'inherit' } as const,
    };
    return (
      <Tag ref={(el) => { wrapper.current = el; }} data-native-text={field} className="block w-full min-w-0">
        {multiline
          ? <textarea {...props} rows={2} style={{ ...props.style, fieldSizing: 'content', resize: 'vertical' }} onChange={(event) => onChange(event.target.value)} />
          : <input {...props} type="text" onChange={(event) => onChange(event.target.value)} />}
      </Tag>
    );
  }

  return (
    <Tag ref={(el) => { wrapper.current = el; }} role="button" tabIndex={0} data-native-text={field}
      aria-label={`Editar ${label.toLocaleLowerCase('es')}`} title={`Editar ${label.toLocaleLowerCase('es')}`}
      className="block min-w-0 cursor-text rounded-sm outline-offset-2 hover:outline-1 hover:outline-dashed hover:outline-sky-500 focus-visible:outline-2 focus-visible:outline-sky-500"
      onClick={startEditing}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        startEditing();
      }}
    >
      {children || value || <span className="text-sm italic opacity-80">+ {label}</span>}
    </Tag>
  );
}
