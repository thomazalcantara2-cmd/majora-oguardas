import { NextResponse } from 'next/server';
import { buscarServidorPorCpf, consultaDentroDoLimiteGlobal, normalizarCpf } from '../../../lib/db';

const MENSAGEM_ERRO_CPF =
  'Não encontramos esse CPF na base de servidores que requereram a majoração. Verifique os números digitados.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_CPF }, { status: 400 });
  }

  const cpfDigitos = normalizarCpf(body.cpf);
  if (cpfDigitos.length !== 11) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_CPF });
  }

  const dentroDoLimite = await consultaDentroDoLimiteGlobal();
  if (!dentroDoLimite) {
    return NextResponse.json({
      ok: false,
      message: 'Muitas consultas em um curto intervalo. Aguarde um momento e tente novamente.'
    });
  }

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
