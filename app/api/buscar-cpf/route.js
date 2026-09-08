import { NextResponse } from 'next/server';
import { buscarServidorPorCpf, normalizarCpf, somenteDigitos } from '../../../lib/db';

const MENSAGEM_ERRO_CPF =
  'Não encontramos esse CPF na base de servidores que apresentaram manifestação. Verifique os números digitados.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_CPF }, { status: 400 });
  }

  // Validado ANTES de qualquer normalização com padding: um CPF incompleto
  // digitado pelo usuário nunca deve ser "completado" com zeros à esquerda
  // — isso só se aplica ao valor já cadastrado na planilha (que pode ter
  // perdido zeros à esquerda por estar numa célula numérica).
  const digitosDigitados = somenteDigitos(body.cpf);
  if (digitosDigitados.length !== 11) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_CPF });
  }

  const cpfDigitos = normalizarCpf(digitosDigitados);

  const servidor = await buscarServidorPorCpf(cpfDigitos);
  if (!servidor) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_CPF });
  }

  if (servidor.bloqueado_ate && new Date(servidor.bloqueado_ate).getTime() > Date.now()) {
    return NextResponse.json({
      ok: false,
      message: 'Muitas tentativas incorretas. Tente novamente mais tarde.'
    });
  }

  return NextResponse.json({ ok: true, id: servidor.id, nome: servidor.nome });
}
