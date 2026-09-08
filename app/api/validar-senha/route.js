import { NextResponse } from 'next/server';
import {
  obterServidorPorId,
  registrarTentativaFalha,
  zerarTentativas,
  registrarAcessoResposta,
  obterLinkResposta,
  MAX_TENTATIVAS,
  normalizarCpf,
  somenteDigitos
} from '../../../lib/db';
import { emitirToken } from '../../../lib/session';
import { formatarData } from '../../../lib/format';

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
  const token = await emitirToken(id);
  const respostaUrl = await obterLinkResposta(servidor.nome, servidor.matricula_key);

  return NextResponse.json({
    ok: true,
    token,
    dados: {
      matricula: servidor.matricula,
      nome: servidor.nome,
      classe: servidor.classe || '',
      status: servidor.status,
      respostaUrl,
      recursoJaEnviado: Boolean(servidor.recurso_pdf_url),
      dataRecurso: servidor.data_recurso ? formatarData(servidor.data_recurso, true) : '',
      recursoPdfUrl: servidor.recurso_pdf_url || '',
      anexoRecursoUrl: servidor.anexo_recurso_url || ''
    }
  });
}
