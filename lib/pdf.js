import PDFDocument from 'pdfkit';

function formatarCpfExibicao(cpfDigitos) {
  const d = String(cpfDigitos || '').replace(/\D/g, '').padStart(11, '0');
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/**
 * Gera o PDF do recurso a partir do texto digitado pelo servidor, no mesmo
 * padrão visual/estrutural do Requerimento (manifestação) original: cabeçalho
 * institucional, aviso de protocolo, parágrafo de abertura, seções
 * numeradas (I — identificação, II — fundamentos, III — declaração) e
 * assinatura eletrônica. Segue a mesma planilha que os Requerimentos
 * originais gravam o CPF completo em texto — é o padrão de documento oficial
 * já em uso pela SEGEP para este processo (a tela do site, à parte, sempre
 * mascara o CPF).
 */
export function gerarPdfRecurso({ nome, matricula, cpf, classe, status, texto, dataHora }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const partes = [];
    doc.on('data', (chunk) => partes.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(partes)));
    doc.on('error', reject);

    const corTitulo = '#16232a';
    const corTexto = '#2a3a40';
    const corDiscreta = '#51636a';
    const corLinha = '#c7d2cf';

    // Cabeçalho institucional
    doc
      .font('Helvetica-Bold')
      .fontSize(10.5)
      .fillColor(corTitulo)
      .text('PREFEITURA MUNICIPAL DO JABOATÃO DOS GUARARAPES', { align: 'center' })
      .fontSize(9)
      .fillColor(corDiscreta)
      .text(
        'SECRETARIA MUNICIPAL DE ADMINISTRAÇÃO, GOVERNO DIGITAL E INOVAÇÃO — SECRETARIA EXECUTIVA DE GESTÃO DE PESSOAS',
        { align: 'center' }
      );

    doc.moveDown(1);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(corTitulo)
      .text('RECURSO ADMINISTRATIVO — MAJORAÇÃO DE JORNADA', { align: 'center' });

    doc.moveDown(0.3);
    doc.font('Helvetica').fontSize(9.5).fillColor(corDiscreta).text(`DATA DO ENVIO: ${dataHora}`, { align: 'center' });

    doc.moveDown(0.6);
    doc
      .font('Helvetica-Bold')
      .fontSize(8.5)
      .fillColor('#9a2e26')
      .text('PROTOCOLO EXCLUSIVAMENTE POR ESTA PLATAFORMA — NÃO SERÁ ACEITA ENTREGA IMPRESSA OU PRESENCIAL.', {
        align: 'center'
      });

    doc.moveDown(1);
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(corTexto)
      .text(
        'Ao Ilustríssimo Senhor Secretário Executivo de Gestão de Pessoas da Secretaria Municipal de Administração, ' +
          'Governo Digital e Inovação do Jaboatão dos Guararapes, o(a) servidor(a) abaixo identificado(a) vem, ' +
          'respeitosamente, apresentar RECURSO ADMINISTRATIVO em face da decisão proferida sobre sua manifestação ' +
          'relativa à classificação preliminar dos servidores ocupantes do cargo de Guarda Municipal que ' +
          'apresentaram requerimento para majoração da jornada semanal de trabalho de 30 (trinta) para 40 ' +
          '(quarenta) horas, com fundamento no art. 8º da Lei Municipal nº 1.597/2024, apresentando, para tanto, ' +
          'os fundamentos que seguem.',
        { align: 'justify', lineGap: 2 }
      );

    function tituloSecao(texto) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').fontSize(11).fillColor(corTitulo).text(texto);
      doc.moveDown(0.3);
    }

    function linhaDado(rotulo, valor) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(corDiscreta).text(rotulo, { continued: false });
      doc.font('Helvetica').fontSize(10.5).fillColor(corTexto).text(valor || '—');
      doc.moveDown(0.35);
    }

    tituloSecao('I — IDENTIFICAÇÃO DO(A) RECORRENTE');
    linhaDado('NOME DO SERVIDOR', nome);
    linhaDado('MATRÍCULA', matricula);
    linhaDado('CPF', formatarCpfExibicao(cpf));
    linhaDado('CLASSE', classe);
    linhaDado('DECISÃO CONTESTADA (MANIFESTAÇÃO)', status);
    linhaDado('DATA DO ENVIO DESTE RECURSO', dataHora);

    tituloSecao('II — FUNDAMENTOS DO RECURSO');
    doc.font('Helvetica').fontSize(10.5).fillColor(corTexto).text(texto, { align: 'justify', lineGap: 3 });

    tituloSecao('III — DECLARAÇÃO');
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(corTexto)
      .text(
        'Declaro que as informações prestadas são verdadeiras e estou ciente de que o presente recurso se refere ' +
          'exclusivamente à contestação da decisão proferida sobre minha manifestação administrativa, não ' +
          'implicando, por si só, seu provimento, tampouco o reconhecimento de mérito quanto às alegações ' +
          'apresentadas.',
        { align: 'justify', lineGap: 2 }
      );

    doc.moveDown(1.4);
    doc
      .moveTo(doc.page.margins.left, doc.y)
      .lineTo(doc.page.width - doc.page.margins.right, doc.y)
      .strokeColor(corLinha)
      .stroke();
    doc.moveDown(0.6);

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(corTitulo).text(nome);
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(corDiscreta)
      .text(`MATRÍCULA ${matricula} — ASSINADO ELETRONICAMENTE EM ${dataHora}`);

    doc.moveDown(0.8);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(corDiscreta)
      .text(`PROTOCOLO RECEBIDO EM ${dataHora} – DOCUMENTO APENAS PARA SEU CONTROLE`);

    doc.moveDown(1.4);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(corDiscreta)
      .text('Documento gerado eletronicamente — Recurso Administrativo | SAD/SEGEP', { align: 'left' });

    doc.end();
  });
}
