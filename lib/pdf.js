import PDFDocument from 'pdfkit';

/**
 * Gera o PDF do recurso a partir do texto digitado pelo servidor — mesmo
 * princípio usado para transformar a manifestação original em PDF: texto
 * digitado vira um documento formatado, não um arquivo solto.
 */
export function gerarPdfRecurso({ nome, matricula, classe, status, texto, dataHora }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const partes = [];
    doc.on('data', (chunk) => partes.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor('#51636a')
      .text('PREFEITURA DO JABOATÃO DOS GUARARAPES', { align: 'center' })
      .text('SECRETARIA EXECUTIVA DE GESTÃO DE PESSOAS — SEGEP', { align: 'center' });

    doc.moveDown(1.2);
    doc
      .font('Helvetica-Bold')
      .fontSize(15)
      .fillColor('#16232a')
      .text('RECURSO ADMINISTRATIVO', { align: 'center' });
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor('#51636a')
      .text('Majoração de jornada semanal — 30h para 40h', { align: 'center' });

    doc.moveDown(1.4);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#d6dedb').stroke();
    doc.moveDown(0.9);

    const linhaDado = (rotulo, valor) => {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#16232a').text(`${rotulo}: `, { continued: true });
      doc.font('Helvetica').fillColor('#16232a').text(valor || '—');
    };

    linhaDado('Servidor(a)', nome);
    linhaDado('Matrícula', matricula);
    linhaDado('Classe', classe);
    linhaDado('Decisão sobre a manifestação', status);
    linhaDado('Apresentado em', dataHora);

    doc.moveDown(1.1);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#d6dedb').stroke();
    doc.moveDown(1.1);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor('#16232a')
      .text('Texto do recurso');
    doc.moveDown(0.4);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor('#16232a')
      .text(texto, { align: 'justify', lineGap: 3 });

    doc.moveDown(2);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor('#7c8b90')
      .text(
        `Documento gerado eletronicamente pelo portal de autoatendimento da SEGEP em ${dataHora}, a partir do texto digitado pelo(a) próprio(a) servidor(a).`,
        { align: 'left' }
      );

    doc.end();
  });
}
