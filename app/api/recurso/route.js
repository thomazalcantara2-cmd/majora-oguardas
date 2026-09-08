import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { obterServidorPorId, registrarRecurso } from '../../../lib/db';
import { verificarToken } from '../../../lib/session';
import { formatarData } from '../../../lib/format';
import { gerarPdfRecurso } from '../../../lib/pdf';

const TAMANHO_MAXIMO_TEXTO = 8000;

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return NextResponse.json({ ok: false, message: 'Requisição inválida.' }, { status: 400 });
  }

  const token = body.token;
  const texto = String(body.texto || '').trim();

  const servidorId = await verificarToken(token);
  if (!servidorId) {
    return NextResponse.json({
      ok: false,
      message: 'Sessão expirada. Refaça a identificação por CPF e a validação de senha.'
    });
  }

  if (!texto) {
    return NextResponse.json({ ok: false, message: 'Escreva o texto do recurso antes de enviar.' });
  }
  if (texto.length > TAMANHO_MAXIMO_TEXTO) {
    return NextResponse.json({
      ok: false,
      message: `O texto excede o tamanho máximo permitido (${TAMANHO_MAXIMO_TEXTO} caracteres).`
    });
  }

  const servidor = await obterServidorPorId(servidorId);
  if (!servidor) {
    return NextResponse.json({
      ok: false,
      message: 'Sessão inválida. Refaça a identificação por CPF e a validação de senha.'
    });
  }

  const agora = new Date();
  const dataHora = formatarData(agora, true);

  const pdfBuffer = await gerarPdfRecurso({
    nome: servidor.nome,
    matricula: servidor.matricula,
    classe: servidor.classe,
    status: servidor.status,
    texto,
    dataHora
  });

  const caminho = `recursos/${servidor.matricula_key}_${Date.now()}.pdf`;
  const resultado = await put(caminho, pdfBuffer, {
    access: 'public',
    addRandomSuffix: true,
    contentType: 'application/pdf'
  });

  await registrarRecurso({
    id: servidor.id,
    matricula: servidor.matricula,
    texto,
    pdfUrl: resultado.url
  });

  return NextResponse.json({
    ok: true,
    timestamp: dataHora,
    recursoPdfUrl: resultado.url
  });
}
