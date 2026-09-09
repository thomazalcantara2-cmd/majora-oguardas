import { NextResponse } from 'next/server';
import { obterServidorPorId, registrarRecurso } from '../../../lib/db';
import { verificarToken } from '../../../lib/session';
import { formatarData, formatarCarimboArquivo } from '../../../lib/format';
import { gerarPdfRecurso } from '../../../lib/pdf';

const TAMANHO_MAXIMO_TEXTO = 8000;
const TAMANHO_MAXIMO_ANEXO = 3 * 1024 * 1024; // 3 MB — margem segura sob o limite de payload do Vercel

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

  let anexo = null;
  if (body.anexo && body.anexo.conteudoBase64) {
    if (!body.anexo.nomeArquivo) {
      return NextResponse.json({ ok: false, message: 'Anexo inválido.' });
    }
    const buffer = Buffer.from(body.anexo.conteudoBase64, 'base64');
    if (buffer.length > TAMANHO_MAXIMO_ANEXO) {
      return NextResponse.json({
        ok: false,
        message: 'O anexo excede o tamanho máximo permitido (3 MB).'
      });
    }
    anexo = { buffer, nomeArquivo: body.anexo.nomeArquivo, tipo: body.anexo.tipo || 'application/octet-stream' };
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
  const carimbo = formatarCarimboArquivo(agora);

  const pdfBuffer = await gerarPdfRecurso({
    nome: servidor.nome,
    matricula: servidor.matricula,
    cpf: servidor.cpf,
    classe: servidor.classe,
    status: servidor.status,
    texto,
    dataHora
  });

  const { pdfUrl: recursoPdfUrl, anexoUrl } = await registrarRecurso({
    id: servidor.id,
    matricula: servidor.matricula,
    nome: servidor.nome,
    bufferPdf: pdfBuffer,
    anexo,
    carimbo
  });

  return NextResponse.json({
    ok: true,
    timestamp: dataHora,
    recursoPdfUrl,
    anexoUrl
  });
}
