/** Ferramentas reais da Luna — copy para a home (pt-BR). */
export type LunaHomeFeature = {
  id: string;
  title: string;
  subtitle: string;
  icon: 'mic-outline' | 'images-outline' | 'document-text-outline' | 'sparkles-outline' | 'layers-outline' | 'code-slash-outline';
  accent: string;
};

export const LUNA_HOME_FEATURES: LunaHomeFeature[] = [
  {
    id: 'voice',
    title: 'Voz',
    subtitle: 'Grave no composer e transcreva quando quiser',
    icon: 'mic-outline',
    accent: '#88C1F2',
  },
  {
    id: 'vision',
    title: 'Imagens',
    subtitle: 'Anexe fotos — a Luna analisa e responde',
    icon: 'images-outline',
    accent: '#C792EA',
  },
  {
    id: 'docs',
    title: 'Arquivos',
    subtitle: 'PDF, DOCX, MD e outros documentos',
    icon: 'document-text-outline',
    accent: '#82AAFF',
  },
  {
    id: 'modes',
    title: 'Modos',
    subtitle: 'Rápida no dia a dia · Completa no Plus',
    icon: 'sparkles-outline',
    accent: '#6BC4A0',
  },
  {
    id: 'memory',
    title: 'Contexto',
    subtitle: 'Retoma assuntos entre conversas',
    icon: 'layers-outline',
    accent: '#FFB74D',
  },
  {
    id: 'rich',
    title: 'Respostas ricas',
    subtitle: 'Código, listas e explicação passo a passo',
    icon: 'code-slash-outline',
    accent: '#F78C6C',
  },
];
