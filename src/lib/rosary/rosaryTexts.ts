import type { RosaryMysterySet, RosaryState, RosaryStep } from '../../hooks/useRosary';
import { currentMysteryName, getHailMaryOrdinal } from '../../hooks/useRosary';

export const MYSTERY_SET_LABELS: Record<RosaryMysterySet, string> = {
  joyful: 'Gozosos',
  sorrowful: 'Dolorosos',
  glorious: 'Gloriosos',
  luminous: 'Luminosos',
};

export const PRAYERS = {
  cross: 'Em nome do Pai, e do Filho, e do Espírito Santo. Amém.',
  creed:
    'Creio em Deus Pai todo-poderoso, Criador do céu e da terra. E em Jesus Cristo, seu único Filho, nosso Senhor, que foi concebido pelo poder do Espírito Santo, nasceu da Virgem Maria, padeceu sob Pôncio Pilatos, foi crucificado, morto e sepultado. Desceu à mansão dos mortos, ressuscitou ao terceiro dia, subiu aos céus, está sentado à direita de Deus Pai todo-poderoso, donde há de vir a julgar os vivos e os mortos. Creio no Espírito Santo, na Santa Igreja Católica, na comunhão dos santos, na remissão dos pecados, na ressurreição da carne e na vida eterna. Amém.',
  ourFather:
    'Pai nosso, que estais nos céus, santificado seja o vosso nome; venha a nós o vosso reino; seja feita a vossa vontade, assim na terra como no céu. O pão nosso de cada dia nos dai hoje; perdoai-nos as nossas ofensas, assim como nós perdoamos a quem nos tem ofendido; e não nos deixeis cair em tentação, mas livrai-nos do mal. Amém.',
  hailMary:
    'Ave Maria, cheia de graça, o Senhor é convosco; bendita sois vós entre as mulheres, e bendito é o fruto do vosso ventre, Jesus. Santa Maria, Mãe de Deus, rogai por nós pecadores, agora e na hora da nossa morte. Amém.',
  glory:
    'Glória ao Pai, e ao Filho, e ao Espírito Santo. Como era no princípio, agora e sempre. Amém.',
  salveRegina:
    'Salve, Rainha, mãe de misericórdia, vida, doçura e esperança nossa, salve! A vós bradamos, os degredados filhos de Eva; a vós suspiramos, gemendo e chorando neste vale de lágrimas. Eia, pois, advogada nossa, esses vossos olhos misericordiosos a nós volvei; e depois deste desterro, mostrai-nos Jesus, bendito fruto do vosso ventre, ó clemente, ó piedosa, ó doce sempre Virgem Maria. Amém.',
} as const;

const MYSTERY_INTROS: Record<RosaryMysterySet, string[]> = {
  joyful: [
    'Contemplamos a Anunciação de Maria. O Anjo anuncia que ela será a Mãe do Salvador — e ela diz sim com confiança.',
    'Contemplamos a Visitação de Maria a Isabel. Maria corre em ajuda; o menino salta de alegria no ventre de Isabel.',
    'Contemplamos o Nascimento de Jesus. Deus se faz pequeno em Belém, entre os pobres e os simples.',
    'Contemplamos a Apresentação de Jesus no Templo. Maria e José oferecem o Filho a Deus Pai.',
    'Contemplamos a Perda e o Reencontro de Jesus no Templo. Maria guarda tudo no coração, mesmo sem compreender.',
  ],
  sorrowful: [
    'Contemplamos a Agonia de Jesus no Horto. Ele suou sangue e pediu: «Pai, se possível, afasta de mim este cálice» — mas se entregou à vontade do Pai.',
    'Contemplamos a Flagelação de Jesus. Por amor a nós, Ele aceita o sofrimento sem revidar.',
    'Contemplamos a Coroação de Espinhos. O Rei do universo é coroado com zombaria — e permanece em silêncio.',
    'Contemplamos a Subida de Jesus ao Calvário. Cai, levanta-se, e segue por nós.',
    'Contemplamos a Crucificação e Morte de Jesus. «Pai, perdoa-lhes» — assim nos ama até o fim.',
  ],
  glorious: [
    'Contemplamos a Ressurreição de Jesus. A morte não venceu: Ele vive, e conosco caminha.',
    'Contemplamos a Ascensão de Jesus. Ele sobe ao céu e não nos deixa órfãos — envia o Espírito.',
    'Contemplamos a Vinda do Espírito Santo. Maria e os apóstolos recebem fogo e coragem.',
    'Contemplamos a Assunção de Maria. Corpo e alma, a Mãe é levada à glória — esperança para nós.',
    'Contemplamos a Coroação de Maria como Rainha do Céu. Ela reina e intercede por nós.',
  ],
  luminous: [
    'Contemplamos o Batismo de Jesus no Jordão. O Pai diz: «Este é o meu Filho amado».',
    'Contemplamos a Auto-revelação nas Bodas de Caná. Maria pede: «Fazei tudo o que Ele vos disser».',
    'Contemplamos o Anúncio do Reino de Deus. Jesus convida à conversão e confiança.',
    'Contemplamos a Transfiguração de Jesus. Por um instante, vemos Sua glória no Tabor.',
    'Contemplamos a Instituição da Eucaristia. Jesus se dá em pão — permanece conosco.',
  ],
};

const BRIDGE_AFTER_PRAYER = [
  'Amém. Vamos em frente, com calma.',
  'Assim. Respira um pouco — seguimos.',
  'Bom. De coração, vamos ao próximo passo.',
  'Amém. Estou aqui contigo.',
];

const OPENING_LINES: Record<RosaryMysterySet, string> = {
  joyful: 'Vamos rezar o terço dos mistérios gozosos.',
  sorrowful: 'Vamos rezar o terço dos mistérios dolorosos.',
  glorious: 'Vamos rezar o terço dos mistérios gloriosos.',
  luminous: 'Vamos rezar o terço dos mistérios luminosos.',
};

function pickVariant(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)]!;
}

const LUNA_DEFAULT_INTENTIONS = [
  'todos os que precisam de paz e consolação hoje',
  'as famílias que atravessam dificuldades',
  'os enfermos e quem cuida deles com amor',
  'a conversão dos corações e a união entre os povos',
  'os jovens que buscam sentido e direção',
  'quem está só, cansado ou sem esperança',
];

export function getDefaultLunaIntention(): string {
  return pickVariant(LUNA_DEFAULT_INTENTIONS);
}

export function getIntentionAcknowledgment(intention: string, fromLuna: boolean): string {
  if (fromLuna) {
    return `Então rezemos ${intention.startsWith('por ') ? intention : `por ${intention}`}.`;
  }
  return 'Guardamos esta intenção no coração.';
}

export function getOpeningMessage(mysterySet: RosaryMysterySet): string {
  return `${OPENING_LINES[mysterySet]} Diz por quem ou pelo que você quer rezar — ou começa direto pelo sinal da cruz.`;
}

export function getCanonicalPrayer(state: RosaryState): string | null {
  switch (state.step) {
    case 'intro':
      return null;
    case 'cross':
      return PRAYERS.cross;
    case 'creed':
      return PRAYERS.creed;
    case 'our_father_opening':
    case 'mystery_our_father':
      return PRAYERS.ourFather;
    case 'hail_mary_3':
    case 'mystery_hail_mary':
      return PRAYERS.hailMary;
    case 'glory_opening':
    case 'mystery_glory':
      return PRAYERS.glory;
    case 'mystery_intro': {
      const intro = MYSTERY_INTROS[state.mysterySet][state.currentMysteryIndex];
      return intro ?? null;
    }
    case 'finished':
      return `${PRAYERS.salveRegina}\n\nTerço finalizado. Que a paz de Deus esteja contigo.`;
    default:
      return null;
  }
}

export function getStepInstruction(state: RosaryState): string {
  const mysteryNum = state.currentMysteryIndex + 1;
  switch (state.step) {
    case 'intro':
      return 'Diz por quem ou pelo que você quer rezar.';
    case 'cross':
      return 'Começamos pelo sinal da cruz.';
    case 'creed':
      return 'Agora o Credo de fé.';
    case 'our_father_opening':
      return 'Agora o Pai-Nosso da abertura.';
    case 'hail_mary_3':
      return `Agora a ${getHailMaryOrdinal(state.hailMaryCount)} Ave-Maria da abertura — são três no total.`;
    case 'glory_opening':
      return 'Agora o Glória ao Pai, na abertura.';
    case 'mystery_intro':
      return `Mistério ${mysteryNum} de 5 — medita um instante e escreve «amém» para seguir.`;
    case 'mystery_our_father':
      return `Neste mistério (${mysteryNum}/5): um Pai-Nosso.`;
    case 'mystery_hail_mary':
      return `Agora a ${getHailMaryOrdinal(state.hailMaryCount)} Ave-Maria desta dezena.`;
    case 'mystery_glory':
      return mysteryNum < 5
        ? 'Glória ao Pai — fechamos esta dezena e seguimos para o próximo mistério.'
        : 'Glória ao Pai — última dezena do terço.';
    case 'finished':
      return 'Por fim: a Salve-Rainha, para encerrar o terço.';
    default:
      return 'Continuamos a oração.';
  }
}

/** Ação curta para o turno do utilizador (ecoar ou rezar). */
export function getShortUserAction(state: RosaryState): string {
  switch (state.step) {
    case 'cross':
      return 'escreve o sinal da cruz';
    case 'creed':
      return 'reza o Credo';
    case 'our_father_opening':
    case 'mystery_our_father':
      return 'reza o Pai-Nosso';
    case 'hail_mary_3':
    case 'mystery_hail_mary':
      return `reza a ${getHailMaryOrdinal(state.hailMaryCount)} Ave-Maria`;
    case 'glory_opening':
    case 'mystery_glory':
      return 'reza o Glória ao Pai';
    case 'mystery_intro':
      return 'escreve «amém» ou uma palavra de fé';
    case 'finished':
      return 'reza a Salve-Rainha';
    default:
      return 'continua a oração';
  }
}

export function getHintForStep(state: RosaryState): string {
  if (state.step === 'intro') {
    return 'Diz por quem ou pelo que você quer rezar…';
  }
  return `${getStepInstruction(state).replace(/\.$/, '')}…`;
}

export function getSoloLeadLine(state: RosaryState): string {
  return getHintForStep(state);
}

export function getBridgeLine(): string {
  return pickVariant(BRIDGE_AFTER_PRAYER);
}

export function getTogetherLeadLine(state: RosaryState): string {
  const prayer = getCanonicalPrayer(state);
  return prayer ?? getHintForStep(state);
}

export function getKickoffLunaLine(mode: 'solo' | 'together', state: RosaryState): string {
  const crossState = state.step === 'intro' ? { ...state, step: 'cross' as const } : state;
  const instruction = getStepInstruction(crossState);
  if (mode === 'together') {
    const prayer = getCanonicalPrayer(crossState);
    return `${instruction}\n\n🌙 Vez da Luna\n\n${prayer}\n\n✦ Sua vez — ecoa escrevendo.`;
  }
  return `${instruction}\n\n✦ Sua vez — ${getShortUserAction(crossState)}.`;
}

export function getLunaLineAfterUserPrayer(
  mode: 'solo' | 'together',
  nextState: RosaryState,
): string {
  const instruction = getStepInstruction(nextState);

  if (nextState.step === 'finished' && nextState.active) {
    const bridge = getBridgeLine();
    const lead = mode === 'together' ? getTogetherLeadLine(nextState) : getSoloLeadLine(nextState);
    if (mode === 'together') {
      return `${bridge}\n\n${instruction}\n\n🌙 Vez da Luna\n\n${lead}\n\n✦ Sua vez — ecoa escrevendo.`;
    }
    return `${bridge}\n\n${instruction}\n\n✦ Sua vez — ${getShortUserAction(nextState)}.`;
  }
  if (nextState.step === 'finished' && !nextState.active) {
    return getCanonicalPrayer({ ...nextState, step: 'finished', active: true }) ?? 'Amém.';
  }
  if (mode === 'solo') {
    const bridge = getBridgeLine();
    return `${bridge}\n\n${instruction}\n\n✦ Sua vez — ${getShortUserAction(nextState)}.`;
  }
  const bridge = getBridgeLine();
  const prayer = getTogetherLeadLine(nextState);
  return `${bridge}\n\n${instruction}\n\n🌙 Vez da Luna\n\n${prayer}\n\n✦ Sua vez — ecoa escrevendo.`;
}

export function getComposerPlaceholder(state: RosaryState, mode: 'solo' | 'together' | null): string {
  if (!state.active || !mode) return 'Escreva para a Luna…';
  if (state.step === 'intro') return 'Por quem ou pelo que você reza?';
  return `✦ ${getShortUserAction(state)}…`;
}

export function getRosaryTurnDetail(state: RosaryState, mode: 'solo' | 'together' | null): string {
  if (!mode) return '';
  if (state.step === 'intro') return 'Por quem ou pelo que você reza?';
  return getStepInstruction(state).replace(/\.$/, '');
}

export function getMysteryIntroText(state: RosaryState): string | null {
  if (state.step !== 'mystery_intro') return null;
  return MYSTERY_INTROS[state.mysterySet][state.currentMysteryIndex] ?? null;
}
