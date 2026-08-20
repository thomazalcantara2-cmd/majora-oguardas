import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { obterServidorPorId, registrarConfirmacao, registrarRequerimento } from '../../../lib/db';
import { verificarToken } from '../../../lib/session';
import { formatarData } from '../../../lib/format';
import { MAX_ANEXO_BYTES, MIME_PERMITIDOS, sanitizarNomeArquivo } from '../../../lib/anexo';

export async function POST(request) {
  const formData = await request.formData();
  const token = formData.get('token');
  const requerimentoTexto = String(formData.get('requerimentoTexto') || '').trim();
  const anexo = formData.get('anexo');

  const servidorId = await verificarToken(token);
  if (!servidorId) {
    return NextResponse.json({
      ok: false,
      message: 'Sessão expirada. Refaça a identificação por CPF e a validação de senha.'
    });
  }

  const anexoValido = anexo && typeof anexo === 'object' && 'arrayBuffer' in anexo && anexo.size > 0;
  if (anexoValido) {
    if (!MIME_PERMITIDOS.has(anexo.type)) {
      return NextResponse.json({
        ok: false,
        message: 'Tipo de arquivo não permitido. Envie PDF, JPG, PNG ou DOCX.'
      });
    }
    if (anexo.size > MAX_ANEXO_BYTES) {
      return NextResponse.json({
        ok: false,
        message: 'Arquivo excede o tamanho máximo permitido (10MB).'
      });
    }
  }

  const servidor = await obterServidorPorId(servidorId);
  if (!servidor) {
    return NextResponse.json({
      ok: false,
      message: 'Sessão inválida. Refaça a identificação por CPF e a validação de senha.'
    });
  }

  const confirmado = await registrarConfirmacao(servidorId);
  if (!confirmado) {
    return NextResponse.json({ ok: false, message: 'Não foi possível registrar. Tente novamente.' });
  }

  let requerimentoRecebido = false;
  if (requerimentoTexto || anexoValido) {
    let anexoUrl = '';
    if (anexoValido) {
      const nomeSanitizado = sanitizarNomeArquivo(anexo.name);
      const caminho = `requerimentos/${servidor.matricula}_${Date.now()}_${nomeSanitizado}`;
      const resultado = await put(caminho, anexo, {
        access: 'public',
        addRandomSuffix: true,
        contentType: anexo.type
      });
      anexoUrl = resultado.url;
    }
    await registrarRequerimento({
      matricula: servidor.matricula,
      nome: confirmado.nome,
      texto: requerimentoTexto,
      anexoUrl
    });
    requerimentoRecebido = true;
  }

  return NextResponse.json({
    ok: true,
    timestamp: formatarData(new Date(), true),
    requerimentoRecebido
  });
}
