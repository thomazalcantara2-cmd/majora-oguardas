import PDFDocument from 'pdfkit';
import { LOGO_BASE64_PNG } from './logoBase64';

// Paleta e proporções extraídas do HTML/CSS usado pelo Apps Script antigo
// para gerar o Requerimento/Manifestação (mesma identidade visual da SEGEP).
const AZUL = '#0A3CC8';
const NAVY = '#17224D';
const NAVY_CORPO = '#1B2340';
const CINZA = '#6B7490';
const CINZA_ORG = '#4A5578';
const BORDA = '#C9CFE3';
const AMARELO = '#FFB612';
const VERDE = '#00A03E';
const AVISO_BG = '#F6F8FD';

const LOGO_PROPORCAO = 450 / 126;

function formatarCpfExibicao(cpfDigitos) {
  const d = String(cpfDigitos || '').replace(/\D/g, '').padStart(11, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

function larguraConteudo(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function desenharCabecalho(doc) {
  const margin = doc.page.margins.left;
  const contentWidth = larguraConteudo(doc);
  const startY = doc.y;
  const logoHeight = 30;
  const logoWidth = logoHeight * LOGO_PROPORCAO;
  const gap = 16;
  const orgWidth = contentWidth - logoWidth - gap;

  doc
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .fillColor(NAVY)
    .text('PREFEITURA MUNICIPAL DO JABOATÃO DOS GUARARAPES', margin, startY, { width: orgWidth });

  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(CINZA_ORG)
    .text(
      'SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO — SECRETARIA EXECUTIVA DE GESTÃO DE PESSOAS',
      margin,
      doc.y + 2,
      { width: orgWidth }
    );

  const textoAbaixo = doc.y;
  const logoBuffer = Buffer.from(LOGO_BASE64_PNG, 'base64');
  doc.image(logoBuffer, margin + orgWidth + gap, startY, { height: logoHeight });

  const rodapeCabecalho = Math.max(textoAbaixo, startY + logoHeight) + 10;
  doc
    .moveTo(margin, rodapeCabecalho)
    .lineTo(margin + contentWidth, rodapeCabecalho)
    .lineWidth(1.6)
    .strokeColor(AZUL)
    .stroke();

  doc.x = margin;
  doc.y = rodapeCabecalho + 14;
}

function barraMeta(doc, texto) {
  const margin = doc.page.margins.left;
  const y = doc.y;
  doc.rect(margin, y + 2, 34, 4).fill(AMARELO);
  doc.rect(margin + 40, y + 2, 12, 4).fill(VERDE);
  doc.font('Helvetica').fontSize(8.5).fillColor(CINZA).text(texto.toUpperCase(), margin + 60, y);
  doc.x = margin;
  doc.moveDown(1);
}

function avisoBox(doc, texto) {
  const margin = doc.page.margins.left;
  const contentWidth = larguraConteudo(doc);
  const padX = 12;
  const padY = 8;
  const faixa = 3;
  const y = doc.y;

  doc.font('Helvetica-Bold').fontSize(9.5);
  const alturaTexto = doc.heightOfString(texto.toUpperCase(), { width: contentWidth - padX * 2 - faixa });
  const alturaCaixa = alturaTexto + padY * 2;

  doc.rect(margin, y, contentWidth, alturaCaixa).fill(AVISO_BG);
  doc.rect(margin, y, faixa, alturaCaixa).fill(AZUL);
  doc
    .fillColor(NAVY)
    .text(texto.toUpperCase(), margin + padX + faixa, y + padY, { width: contentWidth - padX * 2 - faixa });

  doc.x = margin;
  doc.y = y + alturaCaixa + 12;
}

function paragrafo(doc, texto, opcoes) {
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fillColor(NAVY_CORPO)
    .text(texto, { align: 'justify', lineGap: 3.5, ...opcoes });
  doc.moveDown(0.7);
}

function tituloSecao(doc, texto) {
  const margin = doc.page.margins.left;
  const contentWidth = larguraConteudo(doc);
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(AZUL).text(texto.toUpperCase(), { width: contentWidth });
  const y = doc.y + 4;
  doc.moveTo(margin, y).lineTo(margin + contentWidth, y).lineWidth(1).strokeColor(AZUL).stroke();
  doc.x = margin;
  doc.y = y + 10;
}

/** Uma linha de campos label/valor lado a lado, no estilo da tabela de
 * identificação do Requerimento original (rótulo pequeno cinza + valor com
 * linha embaixo). `campos` é um array de { label, valor, largura? } — a
 * soma das larguras (frações de 0 a 1) de uma linha deve dar 1. */
function linhaCampos(doc, campos) {
  const margin = doc.page.margins.left;
  const contentWidth = larguraConteudo(doc);
  const gap = 18;
  const n = campos.length;
  const totalGap = gap * (n - 1);

  let x = margin;
  const yInicio = doc.y;
  let maiorFundo = yInicio;

  campos.forEach((campo) => {
    const fracao = campo.largura || 1 / n;
    const largura = contentWidth * fracao - (n > 1 ? totalGap / n : 0);

    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(CINZA).text(campo.label.toUpperCase(), x, yInicio, {
      width: largura
    });
    const abaixoRotulo = doc.y + 2;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY).text(campo.valor || '—', x, abaixoRotulo, {
      width: largura
    });
    const abaixoValor = doc.y + 4;
    doc
      .moveTo(x, abaixoValor)
      .lineTo(x + largura, abaixoValor)
      .lineWidth(0.75)
      .strokeColor(BORDA)
      .stroke();

    maiorFundo = Math.max(maiorFundo, abaixoValor);
    x += largura + gap;
  });

  doc.x = margin;
  doc.y = maiorFundo + 12;
}

function assinaturaEletronica(doc, { nome, matricula, dataHora }) {
  const margin = doc.page.margins.left;
  const contentWidth = larguraConteudo(doc);
  const largura = contentWidth * 0.62;
  const x = margin + (contentWidth - largura) / 2;
  const y = doc.y + 6;

  doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(1).strokeColor(NAVY).stroke();
  doc
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .fillColor(NAVY)
    .text(nome, x, y + 7, { width: largura, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(CINZA)
    .text(`MATRÍCULA ${matricula} — ASSINADO ELETRONICAMENTE EM ${dataHora}`, x, doc.y + 3, {
      width: largura,
      align: 'center'
    });

  doc.x = margin;
  doc.moveDown(1);
}

/**
 * Gera o PDF do recurso a partir do texto digitado pelo servidor, seguindo
 * o mesmo padrão visual do Requerimento/Manifestação original da SEGEP:
 * cabeçalho com brasão da Prefeitura, tarja azul institucional, aviso de
 * protocolo, identificação em campos rotulados, seções numeradas (I, II,
 * III) e assinatura eletrônica. Assim como o Requerimento original, o PDF
 * grava o CPF completo em texto — a tela do site, à parte, sempre mascara o
 * CPF; é a mesma convenção de documento oficial já usada pela SEGEP.
 */
export function gerarPdfRecurso({ nome, matricula, cpf, classe, status, texto, dataHora }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 54, bottom: 64, left: 54, right: 54 } });
    const partes = [];
    doc.on('data', (chunk) => partes.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    desenharCabecalho(doc);

    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor(AZUL)
      .text('RECURSO ADMINISTRATIVO — MAJORAÇÃO DE JORNADA', { width: larguraConteudo(doc) });
    doc.moveDown(0.4);

    barraMeta(doc, `Data do envio: ${dataHora}`);

    avisoBox(doc, 'Protocolo exclusivamente por esta plataforma — não será aceita entrega impressa ou presencial.');

    paragrafo(
      doc,
      'Ao Ilustríssimo Senhor Secretário Executivo de Gestão de Pessoas da Secretaria Municipal de Administração, ' +
        'Governo Digital e Inovação do Jaboatão dos Guararapes, o(a) servidor(a) abaixo identificado(a) vem, ' +
        'respeitosamente, apresentar RECURSO ADMINISTRATIVO em face da decisão proferida sobre sua manifestação ' +
        'relativa à classificação preliminar dos servidores ocupantes do cargo de Guarda Municipal que ' +
        'apresentaram requerimento para majoração da jornada semanal de trabalho de 30 (trinta) para 40 ' +
        '(quarenta) horas, com fundamento no art. 8º da Lei Municipal nº 1.597/2024, apresentando, para tanto, ' +
        'os fundamentos que seguem.'
    );

    tituloSecao(doc, 'I — Identificação do(a) recorrente');
    linhaCampos(doc, [{ label: 'Nome do servidor', valor: nome, largura: 1 }]);
    linhaCampos(doc, [
      { label: 'Matrícula', valor: matricula, largura: 0.34 },
      { label: 'CPF', valor: formatarCpfExibicao(cpf), largura: 0.33 },
      { label: 'Classe', valor: classe, largura: 0.33 }
    ]);
    linhaCampos(doc, [
      { label: 'Decisão contestada (manifestação)', valor: status, largura: 0.5 },
      { label: 'Data do envio deste recurso', valor: dataHora, largura: 0.5 }
    ]);

    tituloSecao(doc, 'II — Fundamentos do recurso');
    paragrafo(doc, texto);

    tituloSecao(doc, 'III — Declaração');
    doc
      .font('Times-Roman')
      .fontSize(10)
      .fillColor(NAVY_CORPO)
      .text(
        'Declaro que as informações prestadas são verdadeiras e estou ciente de que o presente recurso se refere ' +
          'exclusivamente à contestação da decisão proferida sobre minha manifestação administrativa, não ' +
          'implicando, por si só, seu provimento, tampouco o reconhecimento de mérito quanto às alegações ' +
          'apresentadas.',
        { align: 'justify', lineGap: 3, width: larguraConteudo(doc) }
      );
    doc.moveDown(0.8);

    assinaturaEletronica(doc, { nome, matricula, dataHora });

    doc
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .fillColor(NAVY)
      .text(`PROTOCOLO RECEBIDO EM ${dataHora} – DOCUMENTO APENAS PARA SEU CONTROLE`, {
        width: larguraConteudo(doc),
        align: 'center'
      });

    doc.moveDown(1);
    const margin = doc.page.margins.left;
    const contentWidth = larguraConteudo(doc);
    const yLinha = doc.y;
    doc.moveTo(margin, yLinha).lineTo(margin + contentWidth, yLinha).lineWidth(0.75).strokeColor(BORDA).stroke();
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(CINZA)
      .text('Documento gerado eletronicamente — Recurso Administrativo | SAD/SEGEP', margin, yLinha + 8, {
        width: contentWidth
      });

    doc.end();
  });
}
