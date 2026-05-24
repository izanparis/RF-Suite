import { useMemo } from 'react';
import {
  SlidersHorizontal,
  Activity,
  Table,
  Wand2,
  CircuitBoard,
  FlaskConical,
  Zap,
  Ruler,
  Library,
  FileSearch
} from 'lucide-react';
import { useLanguage } from '../lib/i18n';

export function useTools() {
  const { t } = useLanguage();

  const mainTools = useMemo(() => [
    {
      id: 'calibration',
      name: t('calibration'),
      description: t('desc.calibration'),
      icon: SlidersHorizontal,
    },
    {
      id: 'measurement',
      name: t('measurement'),
      description: t('desc.measurement'),
      icon: Activity,
    },
    {
      id: 'csv-analysis',
      name: t('csv_analysis'),
      description: t('desc.csv_analysis'),
      icon: Table,
    },
    {
      id: 'library',
      name: t('library'),
      description: t('library.desc'),
      icon: Library,
    },
    {
      id: 'samm',
      name: t('samm'),
      description: t('desc.samm'),
      icon: Wand2,
    },
    {
      id: 'compact-model',
      name: t('compact_model'),
      description: t('desc.compact_model'),
      icon: CircuitBoard,
    },
  ], [t]);

  const labTools = useMemo(() => [
    {
      id: 'quick-extract',
      name: 'Extractor Rápido C/L',
      description: 'Extracción inmediata de C/L y SRF por promediado de pendiente.',
      icon: Zap,
    },
    {
      id: 'cutoff-freq',
      name: 'Frecuencia de Corte',
      description: 'Calcula la frecuencia de corte por mínima impedancia.',
      icon: Zap,
    },
    {
      id: 'correction',
      name: 'Corrección Offline',
      description: 'Aplica corrección S-parameter utilizando coeficientes de error externos.',
      icon: FlaskConical,
    },
    {
      id: 'tline-calc',
      name: t('transmission_line'),
      description: t('desc.transmission_line'),
      icon: Ruler,
    },
    {
      id: 'cable-impedance',
      name: t('cable_impedance'),
      description: t('desc.cable_impedance'),
      icon: Zap,
    },
    {
      id: 'datasheets',
      name: 'Datasheets',
      description: 'Busca hojas de datos y fíjalas a componentes medidos.',
      icon: FileSearch,
    },
  ], [t]);

  const allTools = useMemo(() => [...mainTools, ...labTools], [mainTools, labTools]);

  return { mainTools, labTools, allTools };
}
