import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type Announcements } from '@dnd-kit/core';
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ArrowDown, ArrowUp, CalendarClock, Clock, Eye, EyeOff, GripVertical, Heading, Link2, MapPin, MousePointerClick, Share2, Trash2, Type } from 'lucide-react';
import type { ComponentType } from 'react';
import { BLOCK_LABELS, type Block, type BlockType } from '../../shared/content';

export const BLOCK_ICONS: Record<BlockType, ComponentType<{ className?: string }>> = {
  action: MousePointerClick,
  link: Link2,
  heading: Heading,
  location: MapPin,
  contact: Clock,
  social: Share2,
  text: Type,
};

export function blockTitle(b: Block): string {
  switch (b.type) {
    case 'action':
      return b.label || 'Hauptaktion';
    case 'link':
      return b.title || 'Link ohne Titel';
    case 'heading':
      return b.text || 'Überschrift';
    case 'location':
      return b.name || 'Standort';
    case 'contact':
      return [b.phone, b.email].filter(Boolean).join(' · ') || b.hours || 'Kontakt';
    case 'social':
      return `${b.items.length} Profil${b.items.length === 1 ? '' : 'e'}`;
    case 'text':
      return b.text.slice(0, 60) || 'Text';
  }
}
function blockSub(b: Block): string {
  switch (b.type) {
    case 'action':
      return { call: 'Anrufen', email: 'E-Mail', booking: 'Termin', contact: 'Kontakt' }[b.kind] + ` · ${b.value}`;
    case 'link':
      return b.url.replace(/^https?:\/\//, '');
    case 'location':
      return b.address.split('\n')[0];
    default:
      return BLOCK_LABELS[b.type];
  }
}

function Row({ b, i, n, selected, onSelect, onMove, onToggle, onDelete, disabled }: { b: Block; i: number; n: number; selected: boolean; onSelect: () => void; onMove: (d: -1 | 1) => void; onToggle: () => void; onDelete: () => void; disabled: boolean }) {
  const s = useSortable({ id: b.id, disabled });
  const Icon = BLOCK_ICONS[b.type];
  const title = blockTitle(b);
  const scheduled = b.visibleFrom || b.visibleUntil;
  return (
    <li
      ref={s.setNodeRef}
      style={{ transform: CSS.Transform.toString(s.transform), transition: s.transition }}
      className={`blk ${selected ? 'sel' : ''} ${b.enabled ? '' : 'off'} ${s.isDragging ? 'dragging' : ''} ${b.type === 'heading' ? 'heading' : ''}`}
      onClick={onSelect}
    >
      <button type="button" className="grip" aria-label={`Verschieben: ${title}`} {...s.attributes} {...s.listeners} disabled={disabled} onClick={(e) => e.stopPropagation()}>
        <GripVertical className="lucide" />
      </button>
      <span className="typ" title={BLOCK_LABELS[b.type]}>
        <Icon className="lucide" aria-hidden="true" />
      </span>
      <span className="lbl">
        <button type="button" className="sr" onClick={onSelect} aria-pressed={selected}>
          {BLOCK_LABELS[b.type]} bearbeiten: {title}
        </button>
        <b aria-hidden="true">{title}</b>
        <small aria-hidden="true">
          {!b.enabled ? 'Ausgeblendet · ' : scheduled ? 'Zeitgesteuert · ' : ''}
          {blockSub(b)}
        </small>
      </span>
      <span className="ops" onClick={(e) => e.stopPropagation()}>
        {scheduled && <CalendarClock className="lucide" aria-label="Zeitgesteuert" style={{ color: 'var(--warn)', alignSelf: 'center', margin: '0 4px' }} />}
        <button type="button" className="btn ghost icon sm" onClick={() => onMove(-1)} disabled={disabled || i === 0} aria-label={`Nach oben: ${title}`} title="Nach oben">
          <ArrowUp className="lucide" />
        </button>
        <button type="button" className="btn ghost icon sm" onClick={() => onMove(1)} disabled={disabled || i === n - 1} aria-label={`Nach unten: ${title}`} title="Nach unten">
          <ArrowDown className="lucide" />
        </button>
        <button type="button" className="btn ghost icon sm" onClick={onToggle} disabled={disabled} aria-label={b.enabled ? `Ausblenden: ${title}` : `Einblenden: ${title}`} title={b.enabled ? 'Ausblenden' : 'Einblenden'}>
          {b.enabled ? <Eye className="lucide" /> : <EyeOff className="lucide" />}
        </button>
        <button type="button" className="btn ghost icon sm" onClick={onDelete} disabled={disabled} aria-label={`Löschen: ${title}`} title="Löschen">
          <Trash2 className="lucide" />
        </button>
      </span>
    </li>
  );
}

export function BlockList({ blocks, selected, onSelect, onChange, onDelete, disabled }: { blocks: Block[]; selected: string | null; onSelect: (id: string) => void; onChange: (b: Block[]) => void; onDelete: (b: Block, index: number) => void; disabled: boolean }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const title = (id: string | number) => {
    const b = blocks.find((x) => x.id === id);
    return b ? blockTitle(b) : '';
  };
  const pos = (id: string | number) => blocks.findIndex((x) => x.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `„${title(active.id)}“ aufgenommen. Position ${pos(active.id)} von ${blocks.length}. Mit Pfeiltasten verschieben, Leertaste zum Ablegen, Escape zum Abbrechen.`,
    onDragOver: ({ active, over }) => (over ? `„${title(active.id)}“ über Position ${pos(over.id)}.` : `„${title(active.id)}“ ist nicht über einer Position.`),
    onDragEnd: ({ active, over }) => (over ? `„${title(active.id)}“ abgelegt auf Position ${pos(over.id)}.` : `„${title(active.id)}“ abgelegt.`),
    onDragCancel: ({ active }) => `Verschieben von „${title(active.id)}“ abgebrochen.`,
  };
  const end = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = blocks.findIndex((b) => b.id === e.active.id);
    const to = blocks.findIndex((b) => b.id === e.over!.id);
    onChange(arrayMove(blocks, from, to));
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    onChange(arrayMove(blocks, i, j));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end} accessibility={{ announcements, screenReaderInstructions: { draggable: 'Zum Verschieben Leertaste drücken, dann Pfeiltasten verwenden und mit Leertaste ablegen.' } }}>
      <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
        <ul className="blocks" aria-label="Einträge der Seite">
          {blocks.map((b, i) => (
            <Row
              key={b.id}
              b={b}
              i={i}
              n={blocks.length}
              selected={selected === b.id}
              disabled={disabled}
              onSelect={() => onSelect(b.id)}
              onMove={(d) => move(i, d)}
              onToggle={() => onChange(blocks.map((x) => (x.id === b.id ? { ...x, enabled: !x.enabled } : x)))}
              onDelete={() => onDelete(b, i)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}
