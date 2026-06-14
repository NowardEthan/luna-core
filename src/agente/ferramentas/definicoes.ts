import type { DefinicaoFerramenta } from "../../providers/tipos.js";

export const FERRAMENTAS_IDE: DefinicaoFerramenta[] = [
  {
    nome: "read_file",
    descricao:
      "Lê o conteúdo completo de um arquivo. Use para entender o código antes de editar.",
    parametros: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho absoluto ou relativo ao workspace root." },
      },
      required: ["path"],
    },
  },
  {
    nome: "write_file",
    descricao:
      "Cria ou sobrescreve completamente um arquivo. Prefira apply_patch para edições pontuais em arquivos existentes.",
    parametros: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo a criar/sobrescrever." },
        content: { type: "string", description: "Conteúdo completo do arquivo." },
      },
      required: ["path", "content"],
    },
  },
  {
    nome: "apply_patch",
    descricao:
      "Aplica um diff unificado (formato GNU patch) a um arquivo existente. Prefira este método para edições cirúrgicas.",
    parametros: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do arquivo a modificar." },
        patch: {
          type: "string",
          description: "Diff no formato unificado (--- a/... +++ b/... @@ ... @@).",
        },
      },
      required: ["path", "patch"],
    },
  },
  {
    nome: "list_directory",
    descricao: "Lista arquivos e subpastas em um diretório.",
    parametros: {
      type: "object",
      properties: {
        path: { type: "string", description: "Caminho do diretório." },
        recursive: {
          type: "string",
          description: "Se 'true', lista recursivamente. Padrão: 'false'.",
          enum: ["true", "false"],
        },
      },
      required: ["path"],
    },
  },
  {
    nome: "glob",
    descricao: "Encontra arquivos correspondendo a um padrão glob (ex: src/**/*.ts).",
    parametros: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Padrão glob." },
        cwd: {
          type: "string",
          description: "Diretório base para o glob. Padrão: workspace root.",
        },
      },
      required: ["pattern"],
    },
  },
  {
    nome: "grep",
    descricao: "Busca texto ou expressão regular em arquivos do projeto.",
    parametros: {
      type: "object",
      properties: {
        pattern: { type: "string", description: "Texto ou regex a buscar." },
        path: {
          type: "string",
          description: "Caminho ou diretório onde buscar. Padrão: workspace root.",
        },
        case_sensitive: {
          type: "string",
          description: "Se 'true', diferencia maiúsculas. Padrão: 'false'.",
          enum: ["true", "false"],
        },
      },
      required: ["pattern"],
    },
  },
  {
    nome: "run_terminal_command",
    descricao:
      "Executa um comando no terminal integrado do workspace. Use para build, testes, instalar dependências, etc.",
    parametros: {
      type: "object",
      properties: {
        command: { type: "string", description: "Comando a executar." },
        cwd: {
          type: "string",
          description: "Diretório de trabalho. Padrão: workspace root.",
        },
      },
      required: ["command"],
    },
  },
  {
    nome: "git_status",
    descricao: "Retorna o status atual do repositório Git (arquivos modificados, staged, etc.).",
    parametros: {
      type: "object",
      properties: {},
    },
  },
  {
    nome: "git_diff",
    descricao: "Mostra as diferenças de arquivos no repositório.",
    parametros: {
      type: "object",
      properties: {
        path: { type: "string", description: "Arquivo específico. Se omitido, mostra tudo." },
        staged: {
          type: "string",
          description: "Se 'true', mostra o diff dos arquivos em stage. Padrão: 'false'.",
          enum: ["true", "false"],
        },
      },
    },
  },
  {
    nome: "git_commit",
    descricao:
      "Prepara um commit. O commit fica pendente de confirmação do usuário na UI antes de ser efetivado.",
    parametros: {
      type: "object",
      properties: {
        message: { type: "string", description: "Mensagem do commit." },
        files: {
          type: "string",
          description:
            "Arquivos a incluir separados por vírgula. Se omitido, inclui todos os modificados.",
        },
      },
      required: ["message"],
    },
  },
  {
    nome: "search_codebase",
    descricao:
      "Busca semântica no projeto (RAG). Use quando não sabe o nome exato do arquivo ou símbolo.",
    parametros: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Descrição em linguagem natural do que procura.",
        },
      },
      required: ["query"],
    },
  },
];
