import React from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/icon/Icon';
import { useI18n } from '@/lib/i18n';
export const FilterChip: React.FC<{
  label: string;
  excluded: boolean;
  onToggle?: () => void;
  onRemove: () => void;
}> = ({ label, excluded, onToggle, onRemove }) => {
  const { t } = useI18n();
  const content = <>
    {excluded ? <span className="shrink-0 font-semibold">{t('sessions.sidebar.sections.conditionNot')}</span> : null}
    <span className="min-w-0 truncate" dir="auto">{label}</span>
  </>;
  return (
    <span className="oc-tile-inset inline-flex min-w-0 max-w-full items-center rounded text-foreground">
      {onToggle ? (
        <Button type="button" variant="ghost" size="xs"
          className="min-w-0 gap-1 rounded px-0 ps-1.5 pe-1 typography-micro hover:bg-accent focus-visible:bg-accent [@media(pointer:coarse)]:min-h-9 [@media(pointer:coarse)]:min-w-9"
          aria-label={t('sessions.sidebar.sections.excludeCondition', { name: label })}
          aria-pressed={excluded} onClick={onToggle}>
          {content}
        </Button>
      ) : <span className="inline-flex min-w-0 items-center gap-1 ps-1.5 pe-1 typography-micro">{content}</span>}
      <Button type="button" variant="ghost" size="xs"
        className="size-6 shrink-0 rounded p-0 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground [@media(pointer:coarse)]:size-9"
        aria-label={t('sessions.sidebar.sections.removeCondition', { name: label })} onClick={onRemove}>
        <Icon name="close" className="size-3" />
      </Button>
    </span>
  );
};


