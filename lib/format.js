const FUSO_HORARIO = 'America/Recife';

export function formatarData(valor, comHora) {
  if (!valor) return '';
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) return String(valor);

  const opcoes = {
    timeZone: FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  };
  if (comHora) {
    opcoes.hour = '2-digit';
    opcoes.minute = '2-digit';
    opcoes.second = '2-digit';
    opcoes.hour12 = false;
  }

  const partes = new Intl.DateTimeFormat('pt-BR', opcoes).formatToParts(data);
  const get = (tipo) => partes.find((p) => p.type === tipo)?.value || '';
  const dataStr = `${get('day')}/${get('month')}/${get('year')}`;
  if (!comHora) return dataStr;
  return `${dataStr} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Carimbo de data/hora seguro para nome de arquivo (sem barras/dois-pontos),
 * ex: "08-09-2026_14-32-10". Usado para dar um nome único a cada PDF/anexo
 * de recurso salvo no Drive — cada envio vira um arquivo novo, nenhum é
 * sobrescrito ou apagado. */
export function formatarCarimboArquivo(valor) {
  const data = valor instanceof Date ? valor : new Date(valor || Date.now());
  const opcoes = {
    timeZone: FUSO_HORARIO,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  };
  const partes = new Intl.DateTimeFormat('pt-BR', opcoes).formatToParts(data);
  const get = (tipo) => partes.find((p) => p.type === tipo)?.value || '00';
  return `${get('day')}-${get('month')}-${get('year')}_${get('hour')}-${get('minute')}-${get('second')}`;
}
