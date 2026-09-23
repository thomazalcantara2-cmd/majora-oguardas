import { NextResponse } from 'next/server';
import {
  obterServidorPorId,
  registrarTentativaFalha,
  zerarTentativas,
  registrarAcessoResposta,
  obterLinkRespostaRecurso,
  MAX_TENTATIVAS,
  normalizarCpf,
  somenteDigitos
} from '../../../lib/db';

const MENSAGEM_ERRO_SENHA = 'Não foi possível confirmar sua identidade. Verifique a senha e tente novamente.';

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_SENHA }, { status: 400 });
  }

  const id = Number(body.id);
  const senha = String(body.senha || '');

  if (!id) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_SENHA });
  }

  const servidor = await obterServidorPorId(id);
  if (!servidor) {
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_SENHA });
  }

  const agora = Date.now();
  if (servidor.bloqueado_ate && new Date(servidor.bloqueado_ate).getTime() > agora) {
    return NextResponse.json({
      ok: false,
      message: 'Muitas tentativas incorretas. Tente novamente mais tarde.'
    });
  }

  const cpfDigitos = normalizarCpf(servidor.cpf);
  const ultimos4 = cpfDigitos.slice(-4);
  const senhaDigitos = somenteDigitos(senha);

  if (!cpfDigitos || senhaDigitos.length !== 4 || senhaDigitos !== ultimos4) {
    const tentativas = (servidor.tentativas_falhas || 0) + 1;
    await registrarTentativaFalha(id, tentativas);
    if (tentativas >= MAX_TENTATIVAS) {
      return NextResponse.json({
        ok: false,
        message: 'Muitas tentativas incorretas. Acesso bloqueado temporariamente.'
      });
    }
    return NextResponse.json({ ok: false, message: MENSAGEM_ERRO_SENHA });
  }

  await zerarTentativas(id);
  await registrarAcessoResposta(servidor.matricula);
  const respostaRecursoUrl = await obterLinkRespostaRecurso(servidor.nome);

  return NextResponse.json({
    ok: true,
    dados: {
      matricula: servidor.matricula,
      nome: servidor.nome,
      respostaRecursoUrl
    }
  });
}
