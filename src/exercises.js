// Catálogo editorial. A mídia dinâmica só aparece após conferência do movimento
// exato pelo professor; os GIFs legados não fazem parte da interface V1.5.
const rows = [
  ['Peito','Supino reto','supino-reto','Mantenha os pés apoiados, escápulas estáveis e desça a barra com controle. Não quique no peito.'],
  ['Peito','Supino inclinado com halteres','supino-inclinado','Ajuste o banco em inclinação moderada. Controle a descida e mantenha os punhos alinhados.'],
  ['Peito','Supino máquina',null,'Ajuste banco e pegadores à altura do peito. Empurre sem travar os cotovelos.'],
  ['Peito','Crucifixo máquina',null,'Mantenha os cotovelos levemente flexionados e abra lentamente, sem forçar os ombros.'],
  ['Peito','Crossover',null,'Mantenha tronco estável e leve as mãos à frente com cotovelos semiflexionados.'],
  ['Costas','Puxada frente','puxada-frente','Traga a barra em direção à parte superior do peito. Não balance o tronco nem puxe atrás da nuca.'],
  ['Costas','Puxada alta','puxada-frente','Mantenha o peito elevado e puxe até a linha superior do peito, com ombros controlados.'],
  ['Costas','Remada baixa','remada-baixa','Sente-se com coluna neutra. Puxe em direção ao abdômen, levando os cotovelos para trás.'],
  ['Costas','Remada curvada','remada-curvada','Incline o quadril com coluna neutra. Puxe em direção ao abdômen sem levantar o tronco.'],
  ['Costas','Remada unilateral',null,'Apoie o corpo e leve o cotovelo em direção ao quadril sem girar o tronco.'],
  ['Pernas','Agachamento livre','agachamento','Mantenha os pés firmes e os joelhos alinhados com os pés. Desça até a amplitude confortável.'],
  ['Pernas','Agachamento guiado',null,'Ajuste a posição dos pés e mantenha a coluna estável durante a descida.'],
  ['Pernas','Leg press','leg-press','Mantenha lombar e quadril apoiados. Flexione até uma amplitude que preserve a postura.'],
  ['Pernas','Cadeira extensora','cadeira-extensora','Ajuste o eixo do aparelho ao joelho. Estenda as pernas sem dar trancos.'],
  ['Pernas','Mesa flexora','mesa-flexora','Ajuste a máquina ao corpo. Flexione os joelhos sem tirar o quadril do apoio.'],
  ['Pernas','Cadeira flexora',null,'Ajuste o eixo do equipamento e mantenha o quadril apoiado durante a flexão.'],
  ['Pernas','Stiff','stiff','Leve o quadril para trás, joelhos levemente flexionados e pesos próximos às pernas.'],
  ['Pernas','Elevação pélvica','elevacao-pelvica','Apoie a parte superior das costas, eleve o quadril sem hiperestender a lombar.'],
  ['Pernas','Abdução de quadril',null,'Mantenha o tronco estável e abra as pernas sem impulso.'],
  ['Pernas','Panturrilha em pé','panturrilha','Eleve os calcanhares sem balançar o corpo. Faça a descida controlada.'],
  ['Pernas','Panturrilha sentada',null,'Mantenha joelhos alinhados, suba e desça o calcanhar de modo controlado.'],
  ['Ombros','Desenvolvimento com halteres','desenvolvimento','Mantenha o abdômen firme. Empurre os halteres acima da cabeça com controle.'],
  ['Ombros','Desenvolvimento máquina',null,'Ajuste o banco e empurre sem arquear excessivamente a lombar.'],
  ['Ombros','Elevação lateral','elevacao-lateral','Suba os braços até aproximadamente a altura dos ombros sem impulsionar o tronco.'],
  ['Ombros','Elevação frontal',null,'Eleve os braços com ombros estáveis e sem balançar o tronco.'],
  ['Ombros','Crucifixo inverso',null,'Mantenha as escápulas controladas e abra os braços sem encolher os ombros.'],
  ['Braços','Rosca direta','rosca-direta','Mantenha os cotovelos perto do tronco e evite balançar o corpo.'],
  ['Braços','Rosca alternada',null,'Alterne os braços, sem girar o tronco nem deixar o ombro avançar.'],
  ['Braços','Rosca martelo',null,'Mantenha as palmas voltadas uma para a outra e controle a descida.'],
  ['Braços','Tríceps corda','triceps-corda','Deixe os cotovelos próximos ao corpo e estenda os braços sem usar o tronco.'],
  ['Braços','Tríceps francês',null,'Estabilize os cotovelos e estenda os braços sem inclinar a lombar.'],
  ['Braços','Tríceps testa',null,'Mantenha os cotovelos estáveis e leve a carga com controle.'],
  ['Core','Prancha','prancha','Alinhe cabeça, tronco e quadril. Respire normalmente, sem deixar a lombar ceder.'],
  ['Core','Abdominal supra','abdominal-supra','Enrole suavemente a parte superior do tronco sem puxar o pescoço.'],
  ['Core','Abdominal infra',null,'Mova o quadril com controle, sem usar balanço das pernas.'],
  ['Core','Abdominal máquina',null,'Ajuste a máquina e flexione o tronco com controle, sem impulsos.']
];
export const exerciseLibrary = rows.map(([category,name,gif,tip])=>({category,name,gif,tip}));
const index = new Map(exerciseLibrary.map(row=>[row.name.toLocaleLowerCase('pt-BR'),row]));
export function exerciseGuide(name){
  return index.get(String(name||'').trim().toLocaleLowerCase('pt-BR'))||null;
}
export const DEMO_GIFS = [...new Set(exerciseLibrary.map(row=>row.gif).filter(Boolean))];
export const demoPoster = slug => slug ? `/exercicios/posters/${slug}.webp` : null;
export const demoGif = slug => slug ? `/exercicios/gifs/${slug}.gif` : null;

// Adicione aqui somente vídeos próprios, autorizados e conferidos pelo professor.
// Exemplo: 'Supino reto': '/exercicios/videos/supino-reto.webm'
const reviewedVideos = Object.freeze({});

const instructionSteps = {
  'Supino máquina': ['Ajuste a altura do banco para deixar os pegadores próximos à linha do peito.', 'Empurre mantendo ombros apoiados e retorne lentamente.', 'Evite travar os cotovelos ou tirar o tronco do encosto.'],
  'Crucifixo máquina': ['Ajuste o banco e apoie as costas, mantendo os cotovelos levemente flexionados.', 'Feche os braços com controle e abra devagar.', 'Não force a abertura além da amplitude confortável para os ombros.'],
  'Crossover': ['Ajuste a altura das polias com o professor e mantenha uma base estável.', 'Leve as mãos à frente do corpo com os cotovelos semiflexionados.', 'Controle o retorno sem deixar a carga puxar os ombros para trás.'],
  'Remada unilateral': ['Apoie o corpo de forma estável e mantenha as costas alinhadas.', 'Puxe o peso levando o cotovelo em direção ao quadril.', 'Evite girar o tronco para completar a repetição.'],
  'Agachamento guiado': ['Ajuste a posição dos pés e a altura inicial da barra com o professor.', 'Flexione quadril e joelhos de forma controlada e retorne sem perder o apoio.', 'Mantenha joelhos alinhados com os pés e respeite sua amplitude confortável.'],
  'Cadeira flexora': ['Ajuste o banco e os apoios da máquina ao comprimento das pernas.', 'Flexione os joelhos de forma suave e retorne devagar.', 'Mantenha o quadril apoiado e não use impulso.'],
  'Abdução de quadril': ['Ajuste o banco e mantenha o tronco estável.', 'Abra as pernas de forma controlada e retorne lentamente.', 'Evite inclinar o corpo para mover mais carga.'],
  'Panturrilha sentada': ['Sente-se com coxas sob os apoios e pés posicionados na plataforma.', 'Eleve os calcanhares e volte lentamente.', 'Evite balançar o tronco ou fazer a repetição com impulso.'],
  'Desenvolvimento máquina': ['Ajuste banco e pegadores ao corpo, mantendo costas apoiadas.', 'Empurre acima da cabeça com controle e retorne devagar.', 'Evite arquear a lombar ou forçar uma amplitude desconfortável.'],
  'Elevação frontal': ['Fique estável com braços à frente do corpo.', 'Eleve os braços até uma altura confortável e desça com controle.', 'Evite balanço do tronco ou elevar os ombros.'],
  'Crucifixo inverso': ['Ajuste os pegadores e posicione o peito no apoio, se houver.', 'Abra os braços com controle e retorne devagar.', 'Evite encolher os ombros ou tirar o tronco da posição.'],
  'Rosca alternada': ['Fique estável com os cotovelos próximos ao tronco.', 'Flexione um braço de cada vez e controle a descida.', 'Evite girar o tronco ou adiantar o ombro.'],
  'Rosca martelo': ['Segure os halteres com palmas voltadas uma para a outra.', 'Flexione os cotovelos e retorne de forma controlada.', 'Evite balançar o corpo para levantar os pesos.'],
  'Tríceps francês': ['Ajuste a pegada e estabilize os cotovelos.', 'Estenda os braços com controle e retorne devagar.', 'Evite compensar arqueando a lombar.'],
  'Tríceps testa': ['Deite-se com apoio estável e posicione a carga com ajuda, se necessário.', 'Flexione os cotovelos controlando a descida e depois estenda os braços.', 'Mantenha os cotovelos estáveis e escolha uma carga segura.'],
  'Abdominal infra': ['Deite-se com as costas apoiadas e pernas na posição indicada.', 'Movimente o quadril de forma suave e retorne com controle.', 'Evite balançar as pernas ou puxar a lombar com impulso.'],
  'Abdominal máquina': ['Ajuste banco e apoios ao corpo.', 'Flexione o tronco de forma controlada e retorne devagar.', 'Evite usar os braços ou o quadril para lançar a carga.'],
  'Supino reto': ['Deite-se com pés firmes no chão e escápulas apoiadas no banco.', 'Desça a barra com controle em direção ao peito e empurre sem tirar os ombros do banco.', 'Mantenha punhos alinhados; peça ajuda para ajustar a carga e a amplitude.'],
  'Supino inclinado com halteres': ['Ajuste o banco em inclinação moderada e apoie os pés.', 'Desça os halteres com controle e empurre mantendo os punhos alinhados.', 'Não force amplitude que cause desconforto nos ombros.'],
  'Puxada frente': ['Sente-se com as coxas firmes sob os apoios e segure a barra.', 'Puxe em direção à parte superior do peito, levando os cotovelos para baixo.', 'Evite balanço do tronco e não puxe a barra atrás da nuca.'],
  'Puxada alta': ['Ajuste o apoio das coxas e mantenha o peito elevado.', 'Puxe a barra em direção ao peito, controlando o retorno.', 'Evite impulso com o tronco e relaxar totalmente os ombros no retorno.'],
  'Remada baixa': ['Sente-se firme e mantenha a coluna neutra.', 'Puxe a alça em direção ao abdômen e volte devagar.', 'Evite jogar o corpo para trás para mover a carga.'],
  'Remada curvada': ['Flexione o quadril, mantenha os joelhos suaves e a coluna neutra.', 'Puxe o peso em direção ao abdômen e desça com controle.', 'Se a postura se perder, reduza a carga e peça orientação.'],
  'Agachamento livre': ['Apoie os pés no chão e escolha uma posição confortável.', 'Flexione quadril e joelhos mantendo o peso distribuído nos pés; suba com controle.', 'Mantenha joelhos alinhados aos pés e use amplitude adequada para você.'],
  'Leg press': ['Ajuste o banco e deixe quadril e lombar apoiados.', 'Flexione os joelhos sem descolar o quadril e empurre a plataforma com controle.', 'Evite travar os joelhos e não aproxime as pernas além da amplitude confortável.'],
  'Cadeira extensora': ['Ajuste o encosto, o eixo da máquina e o apoio próximo às canelas.', 'Estenda os joelhos de forma suave e retorne sem deixar o peso bater.', 'Evite arrancadas; siga a amplitude indicada pelo professor.'],
  'Mesa flexora': ['Ajuste a máquina e mantenha o quadril apoiado.', 'Flexione os joelhos levando os calcanhares para trás; retorne devagar.', 'Evite tirar o quadril do banco para levantar a carga.'],
  'Stiff': ['Fique em pé com pesos próximos às pernas e joelhos levemente flexionados.', 'Leve o quadril para trás com coluna neutra e retorne contraindo glúteos.', 'Pare a descida antes de perder a posição das costas.'],
  'Elevação pélvica': ['Apoie a parte superior das costas e posicione os pés firmes.', 'Eleve o quadril de forma controlada e volte sem perder a postura.', 'Não hiperestenda a lombar no topo.'],
  'Panturrilha em pé': ['Fique em pé com apoio estável e pés alinhados.', 'Eleve os calcanhares sem balançar e retorne lentamente.', 'Evite usar impulso dos joelhos ou do tronco.'],
  'Desenvolvimento com halteres': ['Sente-se com apoio estável e coloque os halteres próximos aos ombros.', 'Empurre acima da cabeça e volte com controle.', 'Evite arquear a lombar; ajuste a carga com o professor.'],
  'Elevação lateral': ['Fique em pé com braços ao lado do corpo e cotovelos suaves.', 'Eleve os braços até uma altura confortável e desça lentamente.', 'Evite balanço do tronco ou encolher os ombros.'],
  'Rosca direta': ['Fique estável e mantenha os cotovelos perto do tronco.', 'Flexione os cotovelos e desça a barra lentamente.', 'Evite jogar o quadril para frente ou balançar o corpo.'],
  'Tríceps corda': ['Ajuste a polia e mantenha cotovelos próximos ao corpo.', 'Estenda os braços e volte devagar sem mover os ombros.', 'Evite inclinar o tronco para empurrar a carga.'],
  'Prancha': ['Apoie antebraços e pés e organize o corpo em linha.', 'Mantenha o abdômen ativo e respire normalmente.', 'Interrompa se não conseguir sustentar a posição sem deixar a lombar ceder.'],
  'Abdominal supra': ['Deite-se com os joelhos flexionados e pés apoiados.', 'Eleve suavemente a parte superior do tronco e retorne com controle.', 'Não puxe o pescoço com as mãos.']
};

export function exercisePresentation(name) {
  const guide = exerciseGuide(name);
  if (!guide) return null;
  const steps = instructionSteps[guide.name] || [guide.tip];
  return { ...guide, steps, video: reviewedVideos[guide.name] || null };
}
