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
