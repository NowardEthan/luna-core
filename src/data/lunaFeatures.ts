/** Recursos reais da Luna — copy para a home (pt-BR). */
export type LunaHomeFeature = {
  id: string;
  title: string;
  subtitle: string;
  icon:
    | 'mic-outline'
    | 'images-outline'
    | 'document-text-outline'
    | 'sparkles-outline'
    | 'layers-outline'
    | 'code-slash-outline';
  accent: string;
};

export const LUNA_HOME_FEATURES: LunaHomeFeature[] = [
  {
    id: 'voice',
    title: 'Voz',
    subtitle: 'Grave, envie e transcreva mensagens',
    icon: 'mic-outline',
    accent: '#88C1F2',
  },
  {
    id: 'vision',
    title: 'Imagens',
    subtitle: 'Anexe fotos para análise visual',
    icon: 'images-outline',
    accent: '#C792EA',
  },
  {
    id: 'docs',
    title: 'Documentos',
    subtitle: 'PDF, DOCX, MD e arquivos de texto',
    icon: 'document-text-outline',
    accent: '#82AAFF',
  },
  {
    id: 'modes',
    title: 'Modelos',
    subtitle: 'Pulse no dia a dia, Core no Plus',
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
    title: 'Código',
    subtitle: 'Blocos, listas e respostas estruturadas',
    icon: 'code-slash-outline',
    accent: '#F78C6C',
  },
];
